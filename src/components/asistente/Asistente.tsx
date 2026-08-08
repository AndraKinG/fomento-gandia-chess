"use client";

import { useEffect, useRef, useState } from "react";
import { Banner } from "@/components/ui/Banner";

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
 */

type Turno = { papel: "usuario" | "asistente"; texto: string };

const BIENVENIDA =
  "Pregúntame lo que quieras de ajedrez o del club: tu número de orden, la próxima jornada, cómo va una apertura…";

export function Asistente() {
  const [abierto, setAbierto] = useState(false);
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

  async function enviar() {
    const pregunta = texto.trim();
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
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar el asistente" : "Abrir el asistente"}
        // Por encima de la barra inferior del móvil (`bottom-24`), que si no lo
        // tapa; en escritorio no hay barra abajo y baja a su sitio.
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-degradado-club text-2xl text-sobre-acento shadow-lg transition duration-100 active:scale-95 lg:bottom-6 lg:right-6"
      >
        <span aria-hidden>{abierto ? "✕" : "♞"}</span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Asistente del club"
          className="fixed inset-x-2 bottom-40 z-30 flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-borde bg-tarjeta shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96 lg:bottom-24 lg:right-6"
        >
          <div className="border-b border-borde px-4 py-3">
            <p className="text-sm font-semibold text-tinta">Asistente del club</p>
            <p className="text-xs text-tinta-suave">Ajedrez y Fomento de Gandia</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turnos.length === 0 && (
              <p className="text-sm text-tinta-suave">{BIENVENIDA}</p>
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
