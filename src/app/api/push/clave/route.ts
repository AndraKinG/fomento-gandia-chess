import { NextResponse } from "next/server";

/**
 * La clave VAPID pública, para el service worker.
 *
 * POR QUÉ UN ENDPOINT Y NO ESCRIBIRLA EN `sw.js`: un service worker no ve las variables
 * de entorno del build, así que la única alternativa sería dejarla escrita a mano en el
 * fichero — y entonces, el día que se roten las claves VAPID, el rescate de
 * `pushsubscriptionchange` suscribiría contra la vieja y las notificaciones se perderían
 * justo cuando intentan recuperarse. Pidiéndola, siempre es la que usa el servidor.
 *
 * NO ES UN SECRETO Y NO HACE FALTA SESIÓN: esta clave viaja al navegador de cualquiera
 * en cada suscripción y ya está dentro del bundle de JavaScript. La privada —la que
 * firma— no sale del servidor. Dar la pública es lo que hace el protocolo.
 */
export async function GET() {
  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clave) {
    return NextResponse.json({ error: "Sin clave configurada" }, { status: 503 });
  }
  // Se puede cachear: cambia solo si se rotan las claves, y entonces el push ya está
  // roto de todas formas y hay que redesplegar.
  return NextResponse.json(
    { clave },
    { headers: { "cache-control": "public, max-age=3600" } }
  );
}
