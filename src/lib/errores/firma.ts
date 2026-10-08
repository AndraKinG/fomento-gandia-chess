/**
 * Qué se guarda de un error y cómo se agrupan los que son el mismo.
 *
 * PURO a propósito, como `avisos/politica.ts`: decide, no escribe. Quien guarda
 * (`registrar.ts`) toca Supabase; esto se prueba sin base.
 *
 * POR QUÉ HAY UNA "FIRMA" (monitorización propia, 2026-10-08): el mismo fallo en
 * `/club/partidas/123` y en `/club/partidas/456` es UN fallo, no dos. Si cada aparición
 * fuera una fila, una pantalla rota durante una tarde llenaría la tabla de copias y el
 * propietario recibiría un aviso por cada socio que entrara. Con la firma se suma uno
 * al contador de la fila que ya existe, y el aviso sale solo la primera vez.
 *
 * LA FIRMA ES TEXTO LEGIBLE y no un hash: `origen|ruta|mensaje` ya normalizados. Así se
 * entiende mirando la tabla en el SQL Editor, sin tener que adivinar qué hay detrás.
 *
 * QUÉ NO SE GUARDA, y es la razón de que esto sea propio y no un servicio de fuera: en el
 * club hay socios menores (Sub-18). No se guarda quién era, ni su IP, ni la dirección
 * completa con su `?...`, y los correos que aparezcan dentro de un mensaje se tachan.
 * Del navegador solo la familia ("Chrome · Android"), que es lo que hace falta para
 * reproducir un fallo y no sirve para reconocer a nadie.
 */

export type OrigenError = "servidor" | "navegador";

export type ErrorEntrante = {
  origen: OrigenError;
  mensaje: string;
  ruta: string;
  detalle?: string | null;
  digest?: string | null;
  userAgent?: string | null;
};

export type ErrorPreparado = {
  firma: string;
  origen: OrigenError;
  mensaje: string;
  ruta: string;
  detalle: string | null;
  digest: string | null;
  navegador: string | null;
};

/** Topes de tamaño. El endpoint del navegador es público: nada entra sin cortar. */
export const MAX_MENSAJE = 500;
export const MAX_DETALLE = 2000;
export const MAX_RUTA = 200;
const MAX_LINEAS_DETALLE = 12;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Sin `g`: para `test` sobre un trozo suelto (con `g`, `test` arrastra `lastIndex`). */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Tacha lo que pueda identificar a alguien. Se aplica a todo lo que se guarda. */
export function tacharDatos(texto: string): string {
  return texto.replace(CORREO, "[correo]");
}

/**
 * La ruta sin datos: sin `?...` ni `#...`, y con los ids cambiados por `[id]`.
 *
 * Los errores del servidor ya traen la ruta como patrón (`/club/partidas/[id]`, el
 * `routePath` de Next); los del navegador traen la dirección real, y esto los iguala.
 */
export function normalizarRuta(ruta: string): string {
  let limpia = ruta.trim();
  try {
    // Si llega una dirección entera (`https://...`), solo interesa el camino.
    if (/^https?:\/\//i.test(limpia)) limpia = new URL(limpia).pathname;
  } catch {
    // Dirección rota: se sigue con el texto tal cual, cortado abajo.
  }
  limpia = limpia.split(/[?#]/)[0] || "/";
  const segmentos = limpia
    .split("/")
    .map((s) => (ES_UUID.test(s) || /^\d+$/.test(s) ? "[id]" : s));
  return segmentos.join("/").slice(0, MAX_RUTA);
}

/**
 * La ruta que da Next a `onRequestError` (`routePath`), pasada a la de la barra.
 *
 * Next la da como fichero: `/app/club/(vinculado)/partidas/[id]/page`. Sin el `/app`,
 * sin los grupos entre paréntesis (no salen en la dirección) y sin el `page`/`route`
 * final, queda `/club/partidas/[id]` — lo mismo que da `normalizarRuta` desde el
 * navegador, así que las dos se leen igual en la tabla.
 */
export function rutaDeNext(routePath: string): string {
  const segmentos = routePath
    .replace(/^\/app(?=\/|$)/, "")
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s));
  if (segmentos.length && /^(page|route|layout)$/.test(segmentos[segmentos.length - 1])) {
    segmentos.pop();
  }
  return ("/" + segmentos.join("/")).slice(0, MAX_RUTA);
}

/**
 * El mensaje con lo que cambia de una vez a otra quitado, SOLO para la firma.
 *
 * "Partida 8812 no encontrada" y "Partida 9034 no encontrada" son el mismo fallo. Lo
 * que se guarda para leer es el mensaje real (tachado), no este.
 */
export function mensajeParaFirma(mensaje: string): string {
  return tacharDatos(mensaje)
    .replace(UUID, "<id>")
    // Solo números SUELTOS: "partida 12" sí, pero `p256dh` o `utf8` son nombres, no datos.
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MENSAJE);
}

/**
 * Ruido que no es un fallo de la app y no debe avisar a nadie.
 *
 * Cada uno, por qué:
 * - `ResizeObserver loop`: aviso inofensivo del propio navegador, salta solo.
 * - `Script error.`: un error de un script de OTRO dominio; el navegador esconde el
 *   contenido, así que no hay nada que leer ni que arreglar.
 * - Extensiones (`chrome-extension://`, `moz-extension://`, `safari-extension://`): el
 *   traductor o el bloqueador de anuncios del socio, no nuestro código.
 * - `NEXT_REDIRECT` / `NEXT_NOT_FOUND` / `NEXT_HTTP_ERROR`: Next los usa por dentro para
 *   redirigir y para el 404; son su manera de funcionar, no fallos.
 * - Cortes de red (`Failed to fetch`, `Load failed`, `NetworkError`): el socio se quedó
 *   sin cobertura. Pasa mil veces al día en un móvil y no tiene arreglo en el código.
 */
const RUIDO = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /(chrome|moz|safari(-web)?)-extension:\/\//i,
  /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/,
  /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i,
];

export function esRuido(mensaje: string, detalle?: string | null): boolean {
  const texto = `${mensaje}\n${detalle ?? ""}`;
  return RUIDO.some((patron) => patron.test(mensaje) || patron.test(texto));
}

/** "Chrome · Android". Ni versión exacta ni modelo: con eso basta para reproducirlo. */
export function navegadorResumido(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  // El orden importa: Edge y Opera dicen también "Chrome", y Chrome dice "Safari".
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Otro";
  const sistema = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Otro";
  return `${navegador} · ${sistema}`;
}

/** La pila recortada: unas pocas líneas, sin `?...` en las direcciones y tachada. */
function recortarDetalle(detalle: string | null | undefined): string | null {
  if (!detalle) return null;
  const lineas = tacharDatos(detalle)
    .split("\n")
    .slice(0, MAX_LINEAS_DETALLE)
    .map((l) => l.replace(/\?[^\s:)]*/g, ""));
  const texto = lineas.join("\n").trim();
  return texto ? texto.slice(0, MAX_DETALLE) : null;
}

/** Lo que se va a guardar, o `null` si es ruido o no trae nada. */
export function prepararError(e: ErrorEntrante): ErrorPreparado | null {
  const mensajeBruto = (e.mensaje ?? "").trim();
  if (!mensajeBruto) return null;
  if (esRuido(mensajeBruto, e.detalle)) return null;

  const ruta = normalizarRuta(e.ruta || "/");
  const mensaje = tacharDatos(mensajeBruto).slice(0, MAX_MENSAJE);
  return {
    firma: `${e.origen}|${ruta}|${mensajeParaFirma(mensajeBruto)}`,
    origen: e.origen,
    mensaje,
    ruta,
    detalle: recortarDetalle(e.detalle),
    digest: e.digest ? e.digest.slice(0, 64) : null,
    navegador: navegadorResumido(e.userAgent),
  };
}
