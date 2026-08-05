import { decodeEntidades, normalizaNombre } from "./facv-calendario";

export type TorneoFACV = {
  nombre: string;
  /** ISO `yyyy-mm-dd`. */
  fechaInicio: string;
  /** ISO `yyyy-mm-dd`. Igual a `fechaInicio` en los torneos de un día. */
  fechaFin: string;
  lugar: string;
  organizador: string;
};

/**
 * Calendario oficial de torneos de la FACV. Accesible sin login, igual que
 * `of_publico.php` (las dos viven bajo `/staff/`, pero son públicas).
 *
 * A diferencia del calendario de Interclubs, esta página no acepta parámetros:
 * devuelve el año entero (168 torneos en 2026) en una sola respuesta de ~630 KB.
 */
export const URL_CALENDARIO_TORNEOS =
  "https://www.facv.org/appwebfacv/public/staff/torneos/calendario_oficial.php";

/**
 * Las tablas de datos son `table-hover`, una por mes. La página incluye ADEMÁS
 * una rejilla de calendario por mes con `table-bordered`: si se recorren todas
 * las tablas sin distinguir, la rejilla mete filas basura.
 */
const TABLA_DATOS_RE = /<table class="table table-hover[^"]*">[\s\S]*?<\/table>/g;

/** Fila de torneo: empieza por la celda del número de orden. */
const FILA_RE = /<tr>\s*<td>\d+<\/td>[\s\S]*?<\/tr>/g;

const CELDA_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const SPAN_RE = /<span[^>]*>([\s\S]*?)<\/span>/g;
const FECHA_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Insignias que la FACV mete como `<span>` dentro de las celdas: "★ Oficial" en
 * la del nombre y "⛔ A nivel Autonómico" en la de "Bloquea".
 */
const ES_INSIGNIA = (texto: string) => /^[★⛔]/.test(texto) || texto === "Oficial";

function textoPlano(html: string): string {
  return decodeEntidades(html.replace(/<[^>]+>/g, " "));
}

/**
 * Nombre del torneo, que vive en la SEGUNDA celda envuelto en un `<span>` tras
 * las insignias.
 *
 * Se extrae de esa celda concreta y no de la fila entera a propósito: la última
 * celda ("Bloquea") también lleva un `<span>` con insignia, así que un "coge el
 * último span de la fila" devuelve "⛔ A nivel Autonómico" en lugar del nombre
 * en todas las filas bloqueadas — que son justo las de Interclubs.
 */
function nombreDeCelda(celdaHtml: string): string {
  const spans = [...celdaHtml.matchAll(SPAN_RE)]
    .map((m) => textoPlano(m[1]))
    .filter((s) => s && !ES_INSIGNIA(s));
  if (spans.length > 0) return spans[spans.length - 1];
  // Sin spans: el texto de la celda sin las insignias que hubiera.
  return textoPlano(celdaHtml).replace(/[★⛔]/g, "").replace(/\bOficial\b/, "").trim();
}

/** `dd/mm/yyyy` → `yyyy-mm-dd`, o null si no encaja. */
function aISO(fecha: string): string | null {
  const m = FECHA_RE.exec(fecha.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * El lugar llega con basura de maquetación: comas y puntos sobrantes al final
 * ("Olleria,") y espacios múltiples.
 */
function limpiaLugar(lugar: string): string {
  return lugar.replace(/[,;.\s]+$/, "").trim();
}

/**
 * Las jornadas de Interclubs salen también en el calendario oficial
 * ("Interclubs 2026", "Interclubs. Jornada 2", "Interclubs. Ronda 6 Aplazada")
 * y ya viven en la tabla `matches` con su propio flujo de disponibilidad y
 * convocatoria. Importarlas aquí las duplicaría.
 *
 * El filtro va por NOMBRE y no por organizador: de los 168 torneos de 2026, 53
 * los organiza la FACV y casi todos interesan al club (Provincial Individual,
 * Autonómico Blitz, Copa Federación, Zonal Jocs...). Descartar por organizador
 * se llevaría por delante un tercio del calendario.
 */
export function esJornadaInterclubs(nombre: string): boolean {
  return normalizaNombre(nombre).startsWith("interclubs");
}

/**
 * Extrae los torneos del HTML del calendario oficial, excluyendo las jornadas
 * de Interclubs. Las filas sin fecha de inicio válida se descartan en silencio:
 * son maquetación, no torneos.
 */
export function parseCalendarioTorneosFACV(html: string): TorneoFACV[] {
  const torneos: TorneoFACV[] = [];

  for (const tabla of html.match(TABLA_DATOS_RE) ?? []) {
    for (const fila of tabla.match(FILA_RE) ?? []) {
      const celdas = [...fila.matchAll(CELDA_RE)].map((m) => m[1]);
      if (celdas.length < 6) continue;

      const fechaInicio = aISO(textoPlano(celdas[2]));
      if (!fechaInicio) continue;

      const nombre = nombreDeCelda(celdas[1]);
      if (!nombre || esJornadaInterclubs(nombre)) continue;

      torneos.push({
        nombre,
        fechaInicio,
        // La FACV manda siempre la de fin; si faltara, un torneo de un día.
        fechaFin: aISO(textoPlano(celdas[3])) ?? fechaInicio,
        lugar: limpiaLugar(textoPlano(celdas[4])),
        organizador: textoPlano(celdas[5]),
      });
    }
  }

  return torneos;
}
