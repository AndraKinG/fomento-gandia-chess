/**
 * La política de SCRIPTS (CSP `script-src`) y la lectura de sus avisos.
 *
 * PARA QUÉ SIRVE, EN CORTO: si algún día alguien consiguiera colar código en una página
 * de la app (un nombre de socio con `<script>` dentro que se pintara sin escapar, por
 * ejemplo), el navegador lo ejecutaría con la sesión del socio. Con esta política el
 * navegador solo ejecuta los scripts que llevan el `nonce` de ESA visita —un código
 * aleatorio que genera el proxy en cada petición y que quien inyecta no puede adivinar—
 * y los que esos scripts carguen (`'strict-dynamic'`). Es una SEGUNDA barrera: la
 * primera es que React escapa todo lo que pinta, y hoy no se conoce ningún agujero.
 *
 * VA EN MODO "SOLO INFORMAR" (`Content-Security-Policy-Report-Only`, auditoría del
 * 2026-10-08): el navegador NO bloquea nada, solo avisa a `/api/csp` de lo que
 * bloquearía, y eso sale en Admin → Errores como "CSP: bloquearía …". Una CSP mal medida
 * rompe la app entera sin un solo error visible (el navegador simplemente no ejecuta el
 * script), así que primero se mide con tráfico real y luego se pasa a bloquear.
 *
 * CADA PIEZA, POR QUÉ:
 * - `'nonce-…'` + `'strict-dynamic'`: lo de arriba. Next pone el nonce solo en sus
 *   scripts; lo saca de la cabecera de la PETICIÓN (también de la de solo informar: lo
 *   lee `parse-request-headers.js` de Next). El único script nuestro en línea, el del
 *   tema claro/oscuro del layout, lo lleva a mano.
 * - `'self'`: solo para navegadores muy viejos que no entienden `'strict-dynamic'`; los
 *   modernos lo ignoran cuando hay nonce.
 * - `'wasm-unsafe-eval'`: el motor Stockfish es WebAssembly. Sin esto no arranca.
 * - `worker-src 'self'`: el motor corre en un Worker (`/motor/...`) y los avisos en el
 *   service worker (`/sw.js`), los dos de nuestro dominio.
 * - En desarrollo, `'unsafe-eval'`: React lo usa para reconstruir las pilas de error
 *   (documentación de Next). En producción no hace falta.
 */

export const RUTA_AVISOS_CSP = "/api/csp";

/**
 * La CSP BASE (auditoría del 2026-10-08). Estaba en `next.config.ts`, bloqueando; ahora
 * va DENTRO de la misma cabecera que la de scripts (`politicaCompleta`) porque una
 * segunda cabecera de CSP le quitaba el nonce a los scripts de Next (ver `src/proxy.ts`).
 * Eso significa que, mientras la CSP esté en solo informar, la base TAMPOCO bloquea —
 * contra los iframes sigue `X-Frame-Options: DENY`—, y vuelve a bloquear junto con la de
 * scripts al activar `CSP_BLOQUEA`.
 *
 * - `frame-ancestors 'none'`: nadie nos mete en un iframe (clickjacking).
 * - `form-action 'self'`: los formularios solo se mandan a nosotros.
 * - `object-src 'none'` y `base-uri 'self'`: plugins y cambiar la base de las URLs
 *   relativas, que la app no usa.
 */
export const POLITICA_BASE =
  "frame-ancestors 'none'; form-action 'self'; object-src 'none'; base-uri 'self'";

export function politicaScripts(nonce: string, desarrollo = false): string {
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${
      desarrollo ? " 'unsafe-eval'" : ""
    }`,
    "worker-src 'self'",
    `report-uri ${RUTA_AVISOS_CSP}`,
  ].join("; ");
}

/** Un nonce nuevo por petición: 128 bits aleatorios en base64. */
export function nuevoNonce(): string {
  return btoa(crypto.randomUUID());
}

export type AvisoCsp = {
  /** Lo que se guarda como mensaje: "CSP: bloquearía script-src · inline". */
  mensaje: string;
  /** El camino de la página donde pasó, sin `?...`. */
  ruta: string;
  /** Dónde estaba el script (fichero y línea) y el principio del código, si lo hay. */
  detalle: string | null;
};

/**
 * Lee un aviso de CSP tal como lo manda el navegador, en sus dos formatos:
 * - el clásico de `report-uri`: `{ "csp-report": { "document-uri", "blocked-uri", ... } }`
 * - el de la Reporting API: `[{ type: "csp-violation", body: { documentURL, blockedURL, ... } }]`
 *
 * Devuelve `null` si no es un aviso, o si es de OTRA web (`origenPropio`): el endpoint es
 * público y no hay que guardar lo que no viene de nuestras páginas.
 *
 * Lo que se bloquearía se resume: `inline` (script en la página), `eval`, `wasm-eval` o el
 * HOST de la dirección, nunca la dirección entera (puede llevar datos en el `?...`).
 */
export function leerAvisoCsp(cuerpo: unknown, origenPropio: string): AvisoCsp[] {
  const crudos: Record<string, unknown>[] = [];
  if (Array.isArray(cuerpo)) {
    for (const r of cuerpo) {
      if (r && typeof r === "object" && (r as { type?: unknown }).type === "csp-violation") {
        const body = (r as { body?: unknown }).body;
        if (body && typeof body === "object") crudos.push(body as Record<string, unknown>);
      }
    }
  } else if (cuerpo && typeof cuerpo === "object" && "csp-report" in cuerpo) {
    const r = (cuerpo as Record<string, unknown>)["csp-report"];
    if (r && typeof r === "object") crudos.push(r as Record<string, unknown>);
  }

  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const avisos: AvisoCsp[] = [];
  for (const r of crudos.slice(0, 10)) {
    const documento = texto(r["document-uri"] ?? r.documentURL);
    let ruta: string;
    try {
      const url = new URL(documento);
      if (url.origin !== origenPropio) continue;
      ruta = url.pathname;
    } catch {
      continue;
    }
    const directiva =
      texto(r["effective-directive"] ?? r.effectiveDirective) ||
      texto(r["violated-directive"]).split(" ")[0] ||
      "desconocida";
    const bloqueado = resumirBloqueado(texto(r["blocked-uri"] ?? r.blockedURL));
    const fichero = texto(r["source-file"] ?? r.sourceFile).split(/[?#]/)[0];
    const linea = r["line-number"] ?? r.lineNumber;
    const muestra = texto(r["script-sample"] ?? r.sample).slice(0, 60);
    const detalle = [fichero && `${fichero}${linea ? `:${linea}` : ""}`, muestra && `«${muestra}»`]
      .filter(Boolean)
      .join("\n");
    avisos.push({
      mensaje: `CSP: bloquearía ${directiva} · ${bloqueado}`,
      ruta,
      detalle: detalle || null,
    });
  }
  return avisos;
}

function resumirBloqueado(bloqueado: string): string {
  if (!bloqueado || bloqueado === "inline") return "inline";
  if (bloqueado === "eval" || bloqueado === "wasm-eval") return bloqueado;
  try {
    const url = new URL(bloqueado);
    // Las extensiones del navegador se dejan con su esquema: `esRuido` las descarta.
    return url.protocol.endsWith("-extension:") ? `${url.protocol}//` : url.host || url.protocol;
  } catch {
    return bloqueado.slice(0, 40);
  }
}

/** Lo que va en la cabecera: la base y la de scripts JUNTAS (ver `POLITICA_BASE`). */
export function politicaCompleta(nonce: string, desarrollo = false): string {
  return `${POLITICA_BASE}; ${politicaScripts(nonce, desarrollo)}`;
}
