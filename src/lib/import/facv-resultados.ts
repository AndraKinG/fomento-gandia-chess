import { normalizaNombre } from "./facv-calendario";

export type ResultadoFACV = {
  grupo: string;
  ronda: number;
  local: string;
  visitante: string;
  marcadorLocal: number | null;
  marcadorVisitante: number | null;
};

export type EnlaceClasificacionFACV = { grupo: string; url: string };

export type FilaClasificacionFACV = { posicion: number; club: string; puntos: number };

// Mismas expresiones que facv-calendario.ts (misma página): se duplican aquí
// a propósito (cada parser de este directorio es autocontenido) en vez de
// exportarlas desde allí, salvo `normalizaNombre`, que sí se comparte porque
// es pura y no depende de la forma del HTML de esta página en concreto.
const GRUPO_RE = /<div class="grupo-title">([^<]+)<\/div>/g;
const RONDA_RE = /<div class="col-12 col-md-6 col-xl-4" id="g\d+_r(\d+)">/g;
const NOMBRE_EQUIPO_RE = /team-name'>([^<]+)</g;
// El marcador vive en la celda intermedia de la fila ("Local | Res. |
// Visitante"): "<td ... cal-col-res...><span class='fw-bold'>4.5 - 3.5</span></td>".
// Sin jugar todavía, esa misma celda lleva un guión suelto ("-").
const MARCADOR_RE = /cal-col-res[^>]*>\s*<span class='fw-bold'>([^<]+)<\/span>/;

function decodeEntidades(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Aacute;/g, "Á")
    .replace(/&aacute;/g, "á")
    .replace(/&Eacute;/g, "É")
    .replace(/&eacute;/g, "é")
    .replace(/&Iacute;/g, "Í")
    .replace(/&iacute;/g, "í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&oacute;/g, "ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&uacute;/g, "ú")
    .replace(/\s+/g, " ")
    .trim();
}

/** "4.5 - 3.5" -> [4.5, 3.5]; "-" (sin jugar) o cualquier formato inesperado -> [null, null]. */
function parseMarcador(texto: string): [number | null, number | null] {
  const m = /^([\d.]+)\s*-\s*([\d.]+)$/.exec(texto.trim());
  if (!m) return [null, null];
  const local = Number(m[1]);
  const visitante = Number(m[2]);
  if (Number.isNaN(local) || Number.isNaN(visitante)) return [null, null];
  return [local, visitante];
}

/**
 * Extrae del HTML público del calendario FACV (misma página y `r=0` que
 * `parseCalendarioFACV`, T5-1B) los encuentros de `nombreClub` con su
 * marcador global, cuando ya se ha jugado (temporada 2026 completa a fecha
 * de este parser: verificado con una descarga fresca el 2026-07-15, los 335
 * encuentros de todos los grupos ya llevan marcador final).
 */
export function parseResultadosFACV(html: string, nombreClub: string): ResultadoFACV[] {
  const clubNorm = normalizaNombre(nombreClub);
  if (!clubNorm) return [];

  const grupos = [...html.matchAll(GRUPO_RE)].map((m) => ({
    index: m.index ?? 0,
    nombre: decodeEntidades(m[1]),
  }));
  const rondas = [...html.matchAll(RONDA_RE)].map((m) => ({
    index: m.index ?? 0,
    ronda: Number(m[1]),
  }));

  const resultados: ResultadoFACV[] = [];

  for (let i = 0; i < rondas.length; i++) {
    const inicio = rondas[i].index;
    const fin = i + 1 < rondas.length ? rondas[i + 1].index : html.length;
    const bloque = html.slice(inicio, fin);

    let grupoActual = "";
    for (const g of grupos) {
      if (g.index > inicio) break;
      grupoActual = g.nombre;
    }

    for (const filaBloque of bloque.split(/<tr[\s>]/i).slice(1)) {
      const nombres = [...filaBloque.matchAll(NOMBRE_EQUIPO_RE)].map((m) =>
        decodeEntidades(m[1])
      );
      if (nombres.length !== 2) continue;
      const [local, visitante] = nombres;
      const esDelClub =
        normalizaNombre(local).includes(clubNorm) ||
        normalizaNombre(visitante).includes(clubNorm);
      if (!esDelClub) continue;

      const marcadorMatch = MARCADOR_RE.exec(filaBloque);
      const [marcadorLocal, marcadorVisitante] = marcadorMatch
        ? parseMarcador(marcadorMatch[1])
        : [null, null];

      resultados.push({
        grupo: grupoActual,
        ronda: rondas[i].ronda,
        local,
        visitante,
        marcadorLocal,
        marcadorVisitante,
      });
    }
  }

  return resultados;
}

/**
 * Extrae, para cada grupo del calendario que contenga a `nombreClub`, el
 * enlace "Clasificación" GENERAL de chess-results (art=46, sin `&rd=`): el
 * que aparece una vez justo debajo del título del grupo, antes de las
 * tarjetas de ronda. Cada ronda repite su propio enlace de clasificación
 * *tras esa ronda* (con `&rd=N`); esos se ignoran a propósito — interesa la
 * clasificación FINAL vigente, no un snapshot de una ronda concreta.
 */
export function parseEnlacesClasificacionFACV(
  html: string,
  nombreClub: string
): EnlaceClasificacionFACV[] {
  const clubNorm = normalizaNombre(nombreClub);
  if (!clubNorm) return [];

  const grupos = [...html.matchAll(GRUPO_RE)].map((m) => ({
    index: m.index ?? 0,
    nombre: decodeEntidades(m[1]),
  }));

  const enlaces: EnlaceClasificacionFACV[] = [];

  for (let i = 0; i < grupos.length; i++) {
    const inicio = grupos[i].index;
    const fin = i + 1 < grupos.length ? grupos[i + 1].index : html.length;
    const bloque = html.slice(inicio, fin);

    if (!normalizaNombre(bloque).includes(clubNorm)) continue;

    const linkRe = /<a href='([^']+)'[^>]*>Clasificación<\/a>/g;
    let urlGeneral: string | null = null;
    for (const m of bloque.matchAll(linkRe)) {
      const url = decodeEntidades(m[1]);
      if (!url.includes("rd=")) {
        urlGeneral = url;
        break;
      }
    }
    if (urlGeneral) {
      enlaces.push({ grupo: grupos[i].nombre, url: urlGeneral });
    }
  }

  return enlaces;
}

// Fila de la tabla `CRs1` de chess-results (art=46): "Rk." (posición), una
// celda de bandera, "Equipo", "Partidas", +, =, -, y 4 columnas de
// desempate ("Des N"). "Des 1" es "Matchpoints" (2 por victoria de equipo, 1
// por empate): es el valor que se usa como "puntos" de la clasificación.
const FILA_CLASIFICACION_RE =
  /<tr class="CRg[12]b?">\s*<td class="CRc">(\d+)<\/td><td class="CRc">\d+<\/td><td class="CR"><div class="[^"]*"><\/div><\/td><td class="CR">([^<]+)<\/td><td class="CRc">\d+<\/td><td class="CRc">\d+<\/td><td class="CRc">\d+<\/td><td class="CRc">\d+<\/td><td class="CRc">([\d,]+)<\/td>/g;

/** Parsea la tabla de clasificación de una página de chess-results (art=46). */
export function parseClasificacionFACV(html: string): FilaClasificacionFACV[] {
  const filas: FilaClasificacionFACV[] = [];
  for (const m of html.matchAll(FILA_CLASIFICACION_RE)) {
    filas.push({
      posicion: Number(m[1]),
      club: decodeEntidades(m[2]),
      puntos: Number(m[3].replace(",", ".")),
    });
  }
  return filas;
}
