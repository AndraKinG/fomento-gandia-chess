import type { MetadataRoute } from "next";

/**
 * Qué robots entran y dónde.
 *
 * LOS BUSCADORES, FUERA. Era la regla de cuando la web entera era privada, y se mantiene
 * mientras el propietario no decida si el club debe salir en Google (auditoría del
 * 2026-10-08, punto 7: hoy la portada dice `index, follow` y esto lo prohíbe, y la
 * contradicción queda abierta a propósito hasta que lo decida).
 *
 * LOS DE VISTA PREVIA, DENTRO, Y SIN ESO NO HAY TARJETA EN WHATSAPP. Estos robots no
 * indexan nada: piden la página UNA vez para leer el título y la imagen y pintar la
 * tarjeta del enlace. Con `Disallow: /` para todos, uno que respete `robots.txt` no
 * llegaría ni a pedirla, y las etiquetas `og:` del layout no servirían de nada.
 *
 * NO ABRE NADA PRIVADO, y conviene tenerlo claro: `robots.txt` nunca ha sido seguridad,
 * es una petición de cortesía. Lo que protege la zona de socios es la sesión y la RLS. Un
 * robot de vista previa que pida `/club/torneos/...` acaba en el login, igual que
 * cualquiera sin cuenta, y lo único que ve es la tarjeta del club.
 */
const VISTA_PREVIA = [
  "WhatsApp",
  "facebookexternalhit",
  "Facebot",
  "TelegramBot",
  "Twitterbot",
  "Slackbot-LinkExpanding",
  "Discordbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: VISTA_PREVIA, allow: "/" },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
