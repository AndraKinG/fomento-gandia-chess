/**
 * Los servicios de push a los que el servidor acepta mandar avisos.
 *
 * POR QUÉ (2026-10-08): una suscripción es, al final, una DIRECCIÓN a la que el servidor
 * hace un POST cada vez que hay un aviso. La pone el navegador del socio, y la RLS de
 * `push_subscriptions` (0002) le deja escribir sus propias filas directamente, sin pasar
 * por `/api/push/subscribe`. Sin esta lista, un socio con sesión podría apuntar esa
 * dirección a cualquier sitio y hacer que nuestro servidor le mande peticiones allí.
 *
 * POR ESO SE COMPRUEBA EN DOS SITIOS:
 * - al ENVIAR (`send.ts`): es la comprobación que manda, porque cubre también lo que
 *   se haya escrito en la tabla sin pasar por la ruta;
 * - al SUSCRIBIRSE (`/api/push/subscribe`): para rechazarlo antes y, sobre todo, para
 *   que salga en Admin → Errores si un navegador de verdad usa un servicio que aquí no
 *   está. Ese es el riesgo de una lista cerrada: que los avisos de ese socio dejen de
 *   llegar sin que nadie lo note. Así sí se nota.
 *
 * LOS QUE HAY (y quién los usa):
 * - `fcm.googleapis.com` — Chrome, Android, Opera, Samsung Internet, Brave.
 *   `android.googleapis.com` es su dirección antigua; puede quedar en suscripciones viejas.
 * - `*.push.services.mozilla.com` — Firefox.
 * - `*.push.apple.com` — Safari en Mac y en iPhone (la app instalada, desde iOS 16.4).
 * - `*.notify.windows.com` — Edge en Windows.
 *
 * Si sale un error "Servicio push no reconocido", se añade aquí el que diga.
 */

const EXACTOS = ["fcm.googleapis.com", "android.googleapis.com"];
const TERMINACIONES = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

/** El host de la dirección si es de un servicio de push conocido; `null` si no. */
export function hostDeServicioPush(endpoint: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  // Ni otro protocolo, ni usuario/contraseña en la dirección (`https://x@otro`), ni otro
  // puerto: los tres son trucos para que una dirección PAREZCA de un sitio y vaya a otro.
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (EXACTOS.includes(host) || TERMINACIONES.some((t) => host.endsWith(t))) return host;
  return null;
}

export function esServicioPush(endpoint: string): boolean {
  return hostDeServicioPush(endpoint) !== null;
}
