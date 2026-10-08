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
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: nadie nos mete en un iframe. La app
 *   no se carga dentro de ningún sitio a propósito. Van las dos porque la segunda es la que
 *   entienden los navegadores viejos.
 * - `form-action 'self'`: los formularios solo se mandan a nosotros. Comprobado que ninguno
 *   envía a otro dominio ni redirige fuera.
 * - `object-src 'none'` y `base-uri 'self'`: cierran dos trucos clásicos (plugins y cambiar la
 *   base de las URLs relativas) que la app no necesita para nada.
 * - `nosniff`: el navegador no adivina el tipo de un fichero, así que un texto subido no se
 *   puede ejecutar como script.
 * - `Referrer-Policy`: al pinchar un enlace de fuera (la FACV, ChessPairings) no se manda la
 *   ruta completa de la que se viene — que puede llevar ids de partidas o de fichas.
 * - `Permissions-Policy`: se cierran cámara, micrófono y geolocalización, que la app NO usa.
 *   **No** se tocan compartir, portapapeles ni notificaciones, que SÍ usa (`BotonCompartir`,
 *   copiar enlaces, avisos push): cerrarlas los rompería sin un solo error visible.
 *
 * LA CSP DE SCRIPTS (`script-src`) NO VA AQUÍ: necesita un nonce distinto en cada
 * petición, y esta lista es fija. La pone el proxy (`src/proxy.ts`), con la política en
 * `src/lib/seguridad/csp.ts`. Desde el 2026-10-08 está en modo de SOLO INFORMAR: no
 * bloquea nada todavía, solo avisa en Admin → Errores de lo que bloquearía.
 */
const CABECERAS_SEGURIDAD = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; form-action 'self'; object-src 'none'; base-uri 'self'",
  },
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
