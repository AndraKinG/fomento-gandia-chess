/**
 * Lee la suscripción push que manda el navegador (`PushSubscription.toJSON()`), o
 * `null` si no tiene la forma esperada.
 *
 * POR QUÉ (2026-10-08): `/api/push/subscribe` leía `sub.keys.p256dh` sin comprobar nada,
 * así que un cuerpo sin `keys` reventaba con un 500 —"Cannot read properties of
 * undefined"—. Salió en la lista de errores nada más estrenarla. Ahora un cuerpo malo es
 * un 400, que es lo que es: la petición está mal, no el servidor.
 *
 * `https:` obligatorio porque todos los servicios de push lo son, y es a esa dirección
 * adonde el servidor manda luego cada aviso: no tiene sentido guardar otra cosa.
 */

export type SuscripcionPush = { endpoint: string; p256dh: string; auth: string };

/** Holgado: un endpoint real ronda los 200 caracteres y las claves menos de 100. */
const MAX_ENDPOINT = 1000;
const MAX_CLAVE = 200;

const textoValido = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

export function leerSuscripcion(cuerpo: unknown): SuscripcionPush | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const { endpoint, keys } = cuerpo as { endpoint?: unknown; keys?: unknown };
  if (!textoValido(endpoint, MAX_ENDPOINT) || !endpoint.startsWith("https://")) return null;
  if (!keys || typeof keys !== "object") return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (!textoValido(p256dh, MAX_CLAVE) || !textoValido(auth, MAX_CLAVE)) return null;
  return { endpoint, p256dh, auth };
}
