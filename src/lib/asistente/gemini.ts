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

/**
 * El modelo, y su suplente.
 *
 * NINGÚN NOMBRE DE MODELO ES ETERNO, y lo hemos visto DOS VECES el mismo día:
 * Google ya había retirado `gemini-2.5-flash` (que dejó muerto al bot del otro
 * proyecto, ver `docs/referencia/chatbot-ia-garestudio.md`) y, probando aquí, la
 * clave del club recibe un 404 con `gemini-2.5-flash-lite` — "no longer available
 * to new users". Por eso hay `LLM_MODEL` para forzar otro sin tocar código, y por
 * eso el suplente es un ALIAS (`-latest`), que Google va moviendo solo.
 * El catálogo que acepta una clave se consulta en
 * `https://generativelanguage.googleapis.com/v1beta/models?key=CLAVE`.
 *
 * POR QUÉ LA VERSIÓN LIGERA Y NO LA BUENA: `gemini-3.5-flash` contesta algo mejor,
 * pero **se le acabó la cuota gratuita a la tercera pregunta** al probarlo con la
 * clave del club. La ligera aguantó toda la batería sin rechistar y contesta de
 * sobra para esto — reconduce con gracia, no se inventa datos y acierta las fechas.
 * Si algún día se paga la API, `LLM_MODEL=gemini-3.5-flash` y a correr.
 *
 * El suplente entra si el principal da 503 o 429, dentro de la misma petición, así
 * que el socio no se entera.
 */
const MODELO = process.env.LLM_MODEL ?? "gemini-3.1-flash-lite";
const SUPLENTE = "gemini-flash-lite-latest";

const URL = (modelo: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

/** Vueltas máximas de herramientas. Con cinco herramientas de lectura, dos vueltas
 *  cubren "mi ELO y el del rival"; más que eso es que se ha atascado en un bucle, y
 *  cada vuelta es una llamada más contra la cuota. */
const VUELTAS = 4;

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

  // Si el modelo bueno satura, el resto de ESTA conversación sigue con el suplente:
  // cambiar de modelo a mitad de una respuesta es peor que terminarla con el ligero.
  let modelo = MODELO;

  const pedir = (m: string) =>
    fetch(URL(m), {
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

  for (let vuelta = 0; vuelta <= VUELTAS; vuelta++) {
    let respuesta = await pedir(modelo);
    if (
      !respuesta.ok &&
      (respuesta.status === 503 || respuesta.status === 429) &&
      modelo !== SUPLENTE
    ) {
      modelo = SUPLENTE;
      respuesta = await pedir(modelo);
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      throw new Error(`Gemini ${respuesta.status} (${modelo}): ${detalle.slice(0, 300)}`);
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
