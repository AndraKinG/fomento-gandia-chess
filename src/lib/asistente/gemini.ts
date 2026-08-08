import { DECLARACIONES } from "./herramientas";

/**
 * Llamada a Gemini por su API REST, sin librería.
 *
 * SIN SDK A PROPÓSITO: son dos peticiones `fetch` y un bucle. Meter un paquete
 * para esto añade una dependencia que hay que ir actualizando y que arrastra su
 * propia idea de cómo hablar con el modelo, y aquí lo único que se necesita es
 * mandar JSON.
 *
 * LA CLAVE NO SALE DEL SERVIDOR. Este fichero solo se importa desde la ruta de
 * API; si acabara en un componente de cliente, la clave iría en el navegador de
 * cualquiera.
 */

/** El modelo. Cambiar aquí si Google jubila esta versión: es lo único que hay que
 *  tocar, y la capa gratuita es por modelo. */
const MODELO = "gemini-2.5-flash";

const URL = (modelo: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

/** Vueltas máximas de herramientas. Con cinco herramientas de lectura, dos vueltas
 *  cubren "mi ELO y el del rival"; más que eso es que se ha atascado en un bucle, y
 *  cada vuelta es una llamada más contra la cuota. */
const VUELTAS = 3;

export type Turno = { papel: "usuario" | "asistente"; texto: string };

type Parte =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

type Contenido = { role: "user" | "model"; parts: Parte[] };

export type Ejecutor = (
  nombre: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export class SinClave extends Error {}

export async function responder({
  instrucciones,
  historial,
  ejecutor,
}: {
  instrucciones: string;
  historial: Turno[];
  ejecutor: Ejecutor;
}): Promise<string> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new SinClave("Falta GEMINI_API_KEY");

  const contenidos: Contenido[] = historial.map((t) => ({
    role: t.papel === "usuario" ? "user" : "model",
    parts: [{ text: t.texto }],
  }));

  for (let vuelta = 0; vuelta <= VUELTAS; vuelta++) {
    const respuesta = await fetch(URL(MODELO), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucciones }] },
        contents: contenidos,
        tools: [{ functionDeclarations: DECLARACIONES }],
        generationConfig: {
          temperature: 0.8,
          // Tope de respuesta: el asistente contesta corto por instrucciones, y
          // esto es la red por si algún día se enrolla.
          maxOutputTokens: 800,
        },
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      throw new Error(`Gemini ${respuesta.status}: ${detalle.slice(0, 300)}`);
    }

    const datos = (await respuesta.json()) as {
      candidates?: { content?: { parts?: Parte[] } }[];
    };
    const partes = datos.candidates?.[0]?.content?.parts ?? [];

    const llamadas = partes.filter(
      (p): p is Extract<Parte, { functionCall: unknown }> => "functionCall" in p
    );

    if (llamadas.length === 0) {
      const texto = partes
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("")
        .trim();
      return texto;
    }

    // La última vuelta no ejecuta nada: se le devuelve el turno pidiéndole que
    // conteste con lo que ya tiene, en vez de quedarse llamando herramientas.
    if (vuelta === VUELTAS) {
      contenidos.push({ role: "model", parts: llamadas });
      contenidos.push({
        role: "user",
        parts: llamadas.map((l) => ({
          functionResponse: {
            name: l.functionCall.name,
            response: { error: "Ya no quedan consultas. Contesta con lo que tengas." },
          },
        })),
      });
      continue;
    }

    contenidos.push({ role: "model", parts: llamadas });
    const respuestas: Parte[] = [];
    for (const l of llamadas) {
      let resultado: unknown;
      try {
        resultado = await ejecutor(l.functionCall.name, l.functionCall.args ?? {});
      } catch {
        // Un fallo de una consulta no puede tumbar la conversación: se le dice al
        // modelo que ese dato no está y que siga.
        resultado = { error: "No se ha podido consultar ese dato." };
      }
      respuestas.push({
        functionResponse: { name: l.functionCall.name, response: resultado },
      });
    }
    contenidos.push({ role: "user", parts: respuestas });
  }

  return "";
}
