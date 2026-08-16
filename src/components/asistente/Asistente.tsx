"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Banner } from "@/components/ui/Banner";
import {
  aPixeles,
  clasesBoton,
  clasesPanel,
  esArrastre,
  ladoDelPanel,
  panelHaciaAbajo,
  sujetar,
  type Punto,
  type SitioBoton,
} from "@/lib/asistente/boton";
import { moverAsistente } from "@/app/club/perfil/actions";

/**
 * El asistente del club: botón flotante que abre un chat encima de la pantalla.
 *
 * FLOTANTE Y NO UNA SECCIÓN MÁS, por decisión del propietario: así se pregunta sin
 * salir de donde estás —que es justo cuando surgen las dudas, mirando una
 * convocatoria o el orden de fuerza— y no añade una sexta pestaña a un móvil donde
 * ya no caben.
 *
 * NO GUARDA NADA. La conversación vive en memoria y se va al recargar. Para lo que
 * es —resolver una duda— guardarla obligaría a una tabla, sus políticas y una
 * pantalla para borrarla, y nadie ha pedido volver a leer lo que preguntó ayer.
 * Lo único que queda de una pregunta es UN CONTADOR para el panel de admin
 * (migración 0044): cuántas, nunca cuáles.
 *
 * DÓNDE SE PONE LO DECIDE EL SOCIO. Flotar sobre todas las pantallas significa tapar
 * una esquina de todas las pantallas, y cuál estorba depende de con qué mano se sujeta
 * el móvil. Dos formas: la esquina elegida en el perfil (`sitio`, migración 0044) o
 * ARRASTRARLO a donde sea (`posicion`, migración 0045). Si eligió esconderlo, este
 * componente ni se monta: eso lo decide el layout.
 *
 * EL ARRASTRE Y EL TOQUE COMPARTEN BOTÓN, y por eso hay un umbral: nadie toca del todo
 * quieto, así que sin él cualquier temblor del dedo se leería como "lo has movido" y el
 * chat no se abriría nunca. Va con eventos de PUNTERO y `setPointerCapture`, igual que
 * arrastrar una pieza en el tablero y por el mismo motivo: la API de arrastrar de HTML
 * no dispara nada con el dedo.
 */

type Turno = { papel: "usuario" | "asistente"; texto: string };

/**
 * El tamaño de la ventana, y null mientras se pinta en el servidor.
 *
 * SE DEVUELVE UNA CADENA Y SE PARTE DESPUÉS a propósito: `useSyncExternalStore` compara
 * la instantánea con `===`, así que devolver un objeto nuevo en cada llamada sería un
 * bucle infinito de renderizados.
 */
function suscribir(avisar: () => void) {
  window.addEventListener("resize", avisar);
  window.addEventListener("orientationchange", avisar);
  return () => {
    window.removeEventListener("resize", avisar);
    window.removeEventListener("orientationchange", avisar);
  };
}
const medir = () => `${window.innerWidth}x${window.innerHeight}`;
const enElServidor = () => "";

function usePantalla(): { ancho: number; alto: number } | null {
  const medida = useSyncExternalStore(suscribir, medir, enElServidor);
  if (!medida) return null;
  const [ancho, alto] = medida.split("x").map(Number);
  return { ancho, alto };
}

const BIENVENIDA =
  "Pregúntame lo que quieras de ajedrez o del club.";

/** Atajos para el primer mensaje. Una caja de texto en blanco no dice de qué se
 *  puede hablar, y estos tres lo enseñan con ejemplos en vez de con instrucciones. */
const ATAJOS = [
  "¿Cuál es mi número de orden?",
  "¿Cuándo es la próxima jornada?",
  "¿Qué torneos hay pronto?",
];

export function Asistente({
  sitio,
  posicion: guardada,
}: {
  sitio: SitioBoton;
  posicion: Punto | null;
}) {
  const [abierto, setAbierto] = useState(false);
  // Dónde está el botón ahora mismo. Null = en su esquina, que es el caso de quien
  // nunca lo ha arrastrado.
  const [posicion, setPosicion] = useState<Punto | null>(guardada);
  // El arrastre en curso. En una ref y no en estado: cambia en cada `pointermove` y
  // nada de lo que hay dentro se pinta.
  const arrastre = useRef<{ id: number; x0: number; y0: number; movido: boolean } | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = useRef<HTMLDivElement | null>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);

  // Cada respuesta baja la conversación. Sin esto hay que arrastrar a mano para
  // leer justo lo que acabas de preguntar.
  useEffect(() => {
    if (abierto) final.current?.scrollIntoView({ block: "end" });
  }, [turnos, pensando, abierto]);

  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  // Escape cierra, como cualquier ventana que se abre encima.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  // DÓNDE SE PINTAN LAS DOS COSAS cuando el botón se ha arrastrado. Se calcula en el
  // renderizado y no en un efecto: un efecto pintaría primero en la esquina y luego
  // saltaría al sitio bueno, y ese salto se ve.
  //
  // EL TAMAÑO DE PANTALLA SALE DE `useSyncExternalStore` y no de leer `window` al
  // pintar: leerlo al pintar es impuro (lo prohíbe el linter del compilador de React) y
  // además el servidor no tiene `window`, así que la primera pasada discreparía de la
  // del navegador. Con esto, el servidor devuelve "" y las dos coinciden. De propina,
  // girar el móvil recoloca el botón solo, que con una lectura suelta no pasaría.
  const pantalla = usePantalla();
  const centro = posicion && pantalla ? aPixeles(posicion, pantalla.ancho, pantalla.alto) : null;
  const estiloBoton = centro
    ? { left: centro.x, top: centro.y, transform: "translate(-50%, -50%)" }
    : undefined;
  // La ventana se abre HACIA DENTRO de la pantalla y pegada a su botón: hacia el otro
  // lado se saldría por el borde y quedaría medio chat fuera.
  const estiloPanel =
    posicion && centro
      ? {
          ...(ladoDelPanel(posicion) === "derecha"
            ? { right: (pantalla?.ancho ?? 0) - centro.x - 28 }
            : { left: centro.x - 28 }),
          ...(panelHaciaAbajo(posicion)
            ? { top: centro.y + 40 }
            : { bottom: (pantalla?.alto ?? 0) - centro.y + 40 }),
        }
      : undefined;

  async function enviar(desdeAtajo?: string) {
    const pregunta = (desdeAtajo ?? texto).trim();
    if (!pregunta || pensando) return;
    const nuevos: Turno[] = [...turnos, { papel: "usuario", texto: pregunta }];
    setTurnos(nuevos);
    setTexto("");
    setError(null);
    setPensando(true);
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ historial: nuevos }),
      });
      const datos = (await r.json()) as { texto?: string; error?: string };
      if (!r.ok || !datos.texto) {
        setError(datos.error ?? "No he podido contestar.");
        return;
      }
      setTurnos((t) => [...t, { papel: "asistente", texto: datos.texto! }]);
    } catch {
      setError("No hay conexión con el asistente.");
    } finally {
      setPensando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Un arrastre acaba en `pointerup`, y el navegador manda el clic después:
          // sin esto, soltar el botón en su nuevo sitio abriría el chat de propina.
          if (arrastre.current?.movido) return;
          setAbierto((v) => !v);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          // La captura manda los `pointermove` y el `pointerup` a este botón aunque el
          // dedo ya esté lejos: sin ella, el arrastre se corta al salir de él.
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, movido: false };
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (!a || a.id !== e.pointerId) return;
          if (!a.movido && !esArrastre(e.clientX - a.x0, e.clientY - a.y0)) return;
          a.movido = true;
          // Mientras se arrastra, el chat abierto estorba: se cierra al empezar a mover.
          setAbierto(false);
          setPosicion(sujetar(e.clientX, e.clientY, window.innerWidth, window.innerHeight));
        }}
        onPointerUp={(e) => {
          const a = arrastre.current;
          if (!a || a.id !== e.pointerId) return;
          if (a.movido) {
            const p = sujetar(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
            setPosicion(p);
            // Se guarda AL SOLTAR y no mientras se mueve: guardar en cada píxel serían
            // cientos de escrituras por arrastre. Si falla, el botón se queda donde lo
            // has dejado hasta la siguiente recarga; no vale la pena molestar por esto.
            void moverAsistente(p.x, p.y);
          }
          // El `onClick` llega DESPUÉS de esto, así que la marca se limpia más tarde.
          setTimeout(() => {
            arrastre.current = null;
          }, 0);
        }}
        onPointerCancel={() => {
          arrastre.current = null;
        }}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar el asistente" : "Abrir el asistente"}
        // `touch-none` para que arrastrarlo con el dedo no desplace la página.
        // Sin posición propia manda la esquina del perfil; con ella, el estilo.
        className={`fixed z-30 flex h-14 w-14 touch-none items-center justify-center rounded-full bg-degradado-club text-2xl text-sobre-acento shadow-lg active:scale-95 ${
          posicion ? "" : `transition duration-100 ${clasesBoton(sitio)}`
        }`}
        style={estiloBoton}
      >
        <span aria-hidden>{abierto ? "✕" : "♞"}</span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Asistente del club"
          className={`fixed inset-x-2 z-30 flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-borde bg-tarjeta shadow-2xl sm:inset-x-auto sm:w-96 ${
            posicion ? "" : clasesPanel(sitio)
          }`}
          style={estiloPanel}
        >
          <div className="border-b border-borde px-4 py-3">
            <p className="text-sm font-semibold text-tinta">Asistente del club</p>
            <p className="text-xs text-tinta-suave">Ajedrez y Fomento de Gandia</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turnos.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-tinta-suave">{BIENVENIDA}</p>
                <div className="flex flex-col items-start gap-1.5">
                  {ATAJOS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => void enviar(a)}
                      className="rounded-full border border-borde bg-tarjeta-suave px-3 py-1 text-left text-xs text-acento-texto transition duration-100 hover:bg-tarjeta active:scale-[0.97]"
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turnos.map((t, i) => (
              <div
                key={i}
                className={t.papel === "usuario" ? "flex justify-end" : "flex justify-start"}
              >
                <p
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                    t.papel === "usuario"
                      ? "bg-acento-fuerte text-sobre-acento"
                      : "bg-tarjeta-suave text-tinta"
                  }`}
                >
                  {t.texto}
                </p>
              </div>
            ))}
            {pensando && (
              <p className="text-sm text-tinta-suave">Pensando…</p>
            )}
            {error && <Banner tipo="error">{error}</Banner>}
            <div ref={final} />
          </div>

          <div className="flex items-end gap-2 border-t border-borde p-3">
            <textarea
              ref={campo}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              // Intro envía y Mayús+Intro hace salto de línea, que es lo que espera
              // cualquiera que haya usado un chat.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              placeholder="Escribe tu pregunta…"
              className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-borde bg-fondo px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={pensando || texto.trim() === ""}
              className="rounded-xl bg-acento-fuerte px-3 py-2 text-sm font-semibold text-sobre-acento transition duration-100 active:scale-[0.97] disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
