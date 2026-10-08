import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para todas las respuestas.
 *
 * POR QUÉ (auditoría del 2026-10-08): producción solo llevaba HSTS, que lo pone Vercel por
 * su cuenta. Sin `frame-ancestors` ni `X-Frame-Options`, la pantalla de login —y la de
 * aprobar vinculaciones, y la de dar de baja— se podía cargar DENTRO de otra web, invisible,
 * y hacer que alguien pulsara en ella creyendo pulsar otra cosa (clickjacking). Comprobado
 * con `curl` antes de este cambio.
 *
 * LO QUE SE PONE ES LO QUE NO PUEDE ROMPER NADA, y cada pieza se comprobó contra el código:
 *
 * - `X-Frame-Options: DENY`: nadie nos mete en un iframe. La app no se carga dentro de
 *   ningún sitio a propósito. Su pareja moderna, la CSP `frame-ancestors 'none'` (con
 *   `form-action`, `object-src` y `base-uri`), YA NO VA AQUÍ: ver abajo.
 * - `nosniff`: el navegador no adivina el tipo de un fichero, así que un texto subido no se
 *   puede ejecutar como script.
 * - `Referrer-Policy`: al pinchar un enlace de fuera (la FACV, ChessPairings) no se manda la
 *   ruta completa de la que se viene — que puede llevar ids de partidas o de fichas.
 * - `Permissions-Policy`: se cierran cámara, micrófono y geolocalización, que la app NO usa.
 *   **No** se tocan compartir, portapapeles ni notificaciones, que SÍ usa (`BotonCompartir`,
 *   copiar enlaces, avisos push): cerrarlas los rompería sin un solo error visible.
 *
 * NINGUNA CSP VA AQUÍ (desde el 2026-10-08): la pone el proxy (`src/proxy.ts`), una sola
 * cabecera con todo, política en `src/lib/seguridad/csp.ts`. La base (`frame-ancestors`...)
 * estaba aquí, pero en VERCEL acababa llegando a la página como cabecera
 * `content-security-policy` de la PETICIÓN; Next busca el nonce PRIMERO ahí, encontraba
 * esta (sin `script-src`) y sus scripts salían sin nonce. En local no pasaba.
 */
const CABECERAS_SEGURIDAD = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_SEGURIDAD }];
  },
};

export default nextConfig;
