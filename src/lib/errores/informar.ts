import { MAX_DETALLE, MAX_MENSAJE, esRuido } from "@/lib/errores/firma";

/**
 * Manda un error del NAVEGADOR a `/api/errores`. Solo cliente. Nunca lanza.
 *
 * DOS FRENOS AQUÍ, antes de gastar una petición (los de verdad están en la base):
 * - el mismo mensaje se manda UNA vez por página cargada: un error dentro de un bucle de
 *   pintado puede saltar cien veces por segundo;
 * - como mucho `MAX_POR_PAGINA` en total, por lo mismo.
 *
 * `keepalive`: si el error hace que el socio se vaya o recargue, la petición sale igual.
 *
 * LOS ERRORES CON `digest` NO SE MANDAN: son del SERVIDOR y ya los ha guardado
 * `instrumentation.ts`. Al navegador le llegan con el mensaje tapado ("An error occurred
 * in the Server Components render…"), así que mandarlos crearía una segunda fila, la mala,
 * de un fallo que ya está apuntado con su mensaje de verdad.
 */

const MAX_POR_PAGINA = 10;
const yaMandados = new Set<string>();

export function informarError(error: unknown) {
  try {
    if (typeof window === "undefined") return;
    const e = error as Partial<Error> & { digest?: unknown };
    if (typeof e?.digest === "string" && e.digest) return;

    const mensaje = (typeof e?.message === "string" && e.message) || String(error);
    const detalle = typeof e?.stack === "string" ? e.stack : null;
    if (esRuido(mensaje, detalle)) return;
    if (yaMandados.has(mensaje) || yaMandados.size >= MAX_POR_PAGINA) return;
    yaMandados.add(mensaje);

    void fetch("/api/errores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        mensaje: mensaje.slice(0, MAX_MENSAJE),
        ruta: window.location.pathname,
        detalle: detalle ? detalle.slice(0, MAX_DETALLE) : null,
      }),
    }).catch(() => {
      // Sin red no hay forma de avisar, y avisar de eso sería un bucle.
    });
  } catch {
    // Nunca: informar de un error no puede causar otro.
  }
}
