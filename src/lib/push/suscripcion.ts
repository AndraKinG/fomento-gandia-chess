import { esServicioPush } from "@/lib/push/servicios";

/**
 * Lee la suscripción push que manda el navegador (`PushSubscription.toJSON()`).
 *
 * POR QUÉ (2026-10-08): `/api/push/subscribe` leía `sub.keys.p256dh` sin comprobar nada,
 * así que un cuerpo sin `keys` reventaba con un 500 —"Cannot read properties of
 * undefined"—. Salió en la lista de errores nada más estrenarla. Ahora un cuerpo malo es
 * un 400, que es lo que es: la petición está mal, no el servidor.
 *
 * DOS MOTIVOS DE RECHAZO DISTINTOS, porque se tratan distinto:
 * - `forma`: no es una suscripción. Petición mal hecha; nada que mirar.
 * - `servicio`: tiene forma de suscripción pero apunta a un sitio que no es un servicio
 *   de push conocido (`servicios.ts`). Puede ser alguien probando, o un navegador de
 *   verdad con un servicio que no está en la lista — y entonces a ese socio no le
 *   llegarían los avisos. Por eso la ruta lo apunta en la lista de errores.
 */

export type SuscripcionPush = { endpoint: string; p256dh: string; auth: string };

export type Lectura =
  | { ok: true; suscripcion: SuscripcionPush }
  | { ok: false; motivo: "forma" | "servicio"; endpoint?: string };

/** Holgado: un endpoint real ronda los 200 caracteres y las claves menos de 100. */
const MAX_ENDPOINT = 1000;
const MAX_CLAVE = 200;

const textoValido = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

export function leerSuscripcion(cuerpo: unknown): Lectura {
  const mala = { ok: false, motivo: "forma" } as const;
  if (!cuerpo || typeof cuerpo !== "object") return mala;
  const { endpoint, keys } = cuerpo as { endpoint?: unknown; keys?: unknown };
  if (!textoValido(endpoint, MAX_ENDPOINT)) return mala;
  if (!keys || typeof keys !== "object") return mala;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (!textoValido(p256dh, MAX_CLAVE) || !textoValido(auth, MAX_CLAVE)) return mala;
  if (!esServicioPush(endpoint)) return { ok: false, motivo: "servicio", endpoint };
  return { ok: true, suscripcion: { endpoint, p256dh, auth } };
}
