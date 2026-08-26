/**
 * Lectura de la PÁGINA PÚBLICA de un torneo de ChessPairings, sin ninguna clave.
 *
 * POR QUÉ ESTO Y NO SU API, que ya estaba escrita y funcionando (decisión del propietario,
 * 2026-08-26): **su API solo da los torneos de la cuenta cuya clave esté configurada**, y
 * el club quiere que los torneos los cree quien organiza, con su propia cuenta y sin pedir
 * permiso a nadie. Con la API eso obligaría a guardar la clave de cada organizador —
 * credenciales de terceros en nuestra base— o a que todo pasara por una sola persona, que
 * es justo lo que se quería evitar.
 *
 * Su página pública, en cambio, **no pide autenticación**: basta el enlace con su token,
 * que es público por diseño (están en el sitemap de ChessPairings, 786 torneos indexados).
 * Y su `robots.txt` la permite expresamente; lo único que prohíbe es su capa interna de
 * `/ajax/`.
 *
 * SE PIDE EN INGLÉS A PROPÓSITO (`&lang=en`). Las cabeceras de sus tablas cambian con el
 * idioma —"Points" pasa a "Puntos" o "Punti"— y también las cambia el `Accept-Language`
 * del navegador. Fijando el idioma, las columnas se llaman siempre igual y el parser no
 * depende de con qué idioma esté configurada la cuenta de quien organiza.
 *
 * LAS COLUMNAS SE BUSCAN POR NOMBRE, NO POR POSICIÓN, y no es un lujo: el orden cambia de
 * un torneo a otro según los desempates que haya elegido el árbitro (en uno vimos
 * `DE, Win, Buc1, BucT, SB` y el orden de esa lista es cosa suya). Leyendo por posición,
 * un torneo con otros desempates enseñaría el Buchholz en la columna del Sonneborn.
 *
 * EL JOIN ENTRE PESTAÑAS VA POR SU `id_giocatore`, que aparece en el enlace de cada
 * jugador: es estable dentro del torneo. Cruzar por nombre entre sus propias tablas sería
 * pelearse con "Apellidos, Nombre" y los acentos sin necesidad.
 *
 * MÓDULO PURO Y CON TESTS SOBRE SU HTML REAL. Es un parser de página ajena: el día que
 * rediseñen, los tests lo dicen en vez de que la clasificación salga vacía.
 */

import { resultadoDesdeBlancas } from "@/lib/import/chesspairings";

/** Las pestañas de su página pública. En italiano, como toda su nomenclatura. */
export type PestanaPublica = "classifica" | "abbinamenti" | "iscritti";

export type FilaClasificacionPublica = {
  posicion: number;
  /** Su id dentro del torneo, para cruzar con las otras pestañas. */
  idJugador: number | null;
  /** Como ellos lo escriben: "Apellidos, Nombre". */
  nombre: string;
  federacion: string | null;
  rating: number | null;
  puntos: number;
  /** Buchholz cortado, Buchholz total y Sonneborn-Berger, si el árbitro los usa. */
  buc1: number | null;
  buct: number | null;
  sb: number | null;
};

export type MesaPublica = {
  mesa: number;
  blancas: { idJugador: number | null; nombre: string } | null;
  negras: { idJugador: number | null; nombre: string } | null;
  /** Desde las blancas, con el vocabulario de la app. */
  resultado: "1" | "0.5" | "0" | null;
  esBye: boolean;
};

export type InscritoPublico = {
  idJugador: number | null;
  nombre: string;
  /** Su ID FIDE, si lo tiene. Es lo que permite cruzar con nuestras fichas por número. */
  fideId: string | null;
};

/** La URL de una pestaña, con el idioma fijado. */
export function urlPestana(enlacePublico: string, pestana: PestanaPublica): string {
  const limpio = enlacePublico.split("#")[0];
  const separador = limpio.includes("?") ? "&" : "?";
  return `${limpio}${separador}tab=${pestana}&lang=en`;
}

/** Texto de un trozo de HTML: sin etiquetas, sin entidades y sin espacios de sobra. */
export function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Las filas `<tr>` de la primera tabla de la página. */
function filasDe(html: string): string[] {
  const tabla = /<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
  return tabla.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
}

/** Las celdas de una fila, ya en texto. */
function celdas(fila: string): string[] {
  return [...fila.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => texto(m[1]));
}

/**
 * En qué posición está la columna que se llama así.
 *
 * Compara sin mayúsculas ni puntos finales ("No." y "no" son la misma), y devuelve -1 si
 * esa columna no existe — que es información, no un error: un torneo sin Sonneborn no
 * tiene columna SB.
 */
export function columna(cabeceras: string[], nombre: string): number {
  const limpio = (s: string) => s.toLowerCase().replace(/[.\s]/g, "");
  return cabeceras.findIndex((c) => limpio(c) === limpio(nombre));
}

/** Los `id_giocatore` que aparecen en los enlaces de una fila, en orden. */
function idsDeJugador(fila: string): number[] {
  return [...fila.matchAll(/id_giocatore=(\d+)/g)].map((m) => Number(m[1]));
}

const aNumero = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const limpio = v.replace(",", ".").trim();
  if (limpio === "" || limpio === "-" || limpio === "—") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

/** Quita el "(0)" que su tabla de emparejamientos pega detrás del nombre. */
function sinSufijo(nombre: string): string {
  return nombre.replace(/\s*\(\d+\)\s*$/, "").trim();
}

export function parsearClasificacionPublica(html: string): FilaClasificacionPublica[] {
  const filas = filasDe(html);
  if (filas.length < 2) return [];
  const cab = celdas(filas[0]);
  const iPos = columna(cab, "Rank");
  const iJug = columna(cab, "Player");
  const iFed = columna(cab, "Fed");
  const iRat = columna(cab, "Rating");
  const iPts = columna(cab, "Points");
  const iBuc1 = columna(cab, "Buc1");
  const iBucT = columna(cab, "BucT");
  const iSB = columna(cab, "SB");

  const salida: FilaClasificacionPublica[] = [];
  for (const fila of filas.slice(1)) {
    const c = celdas(fila);
    if (c.length === 0) continue;
    const nombre = sinSufijo(iJug >= 0 ? (c[iJug] ?? "") : "");
    if (!nombre) continue;
    salida.push({
      posicion: aNumero(iPos >= 0 ? c[iPos] : undefined) ?? salida.length + 1,
      idJugador: idsDeJugador(fila)[0] ?? null,
      nombre,
      federacion: (iFed >= 0 ? c[iFed] : "") || null,
      rating: aNumero(iRat >= 0 ? c[iRat] : undefined),
      puntos: aNumero(iPts >= 0 ? c[iPts] : undefined) ?? 0,
      buc1: aNumero(iBuc1 >= 0 ? c[iBuc1] : undefined),
      buct: aNumero(iBucT >= 0 ? c[iBucT] : undefined),
      sb: aNumero(iSB >= 0 ? c[iSB] : undefined),
    });
  }
  return salida;
}

export function parsearEmparejamientosPublicos(html: string): MesaPublica[] {
  const filas = filasDe(html);
  if (filas.length < 2) return [];
  const cab = celdas(filas[0]);
  const iMesa = columna(cab, "Bd");
  const iBlancas = columna(cab, "White");
  const iRes = columna(cab, "Result");
  const iNegras = columna(cab, "Black");

  const salida: MesaPublica[] = [];
  for (const fila of filas.slice(1)) {
    const c = celdas(fila);
    if (c.length === 0) continue;
    const nombreB = sinSufijo(iBlancas >= 0 ? (c[iBlancas] ?? "") : "");
    const nombreN = sinSufijo(iNegras >= 0 ? (c[iNegras] ?? "") : "");
    if (!nombreB && !nombreN) continue;
    const ids = idsDeJugador(fila);
    const bruto = (iRes >= 0 ? c[iRes] : "") ?? "";
    // UN BYE ES UNA FILA CON UN SOLO JUGADOR. También lo delata su marca "+--", la misma
    // que usa su API, pero lo que manda es que no haya rival: una fila sin negras no es
    // una partida por mucho que ponga un resultado.
    const bye = !nombreB || !nombreN || /^\+--$/.test(bruto.trim());
    salida.push({
      mesa: aNumero(iMesa >= 0 ? c[iMesa] : undefined) ?? salida.length + 1,
      blancas: nombreB ? { idJugador: ids[0] ?? null, nombre: nombreB } : null,
      negras: nombreN ? { idJugador: ids[1] ?? ids[0] ?? null, nombre: nombreN } : null,
      resultado: bye ? null : resultadoDesdeBlancas(bruto),
      esBye: bye,
    });
  }
  return salida;
}

export function parsearInscritosPublicos(html: string): InscritoPublico[] {
  const filas = filasDe(html);
  if (filas.length < 2) return [];
  const cab = celdas(filas[0]);
  const iJug = columna(cab, "Player");
  const iFide = columna(cab, "FIDE ID");

  const salida: InscritoPublico[] = [];
  for (const fila of filas.slice(1)) {
    const c = celdas(fila);
    if (c.length === 0) continue;
    const nombre = sinSufijo(iJug >= 0 ? (c[iJug] ?? "") : "");
    if (!nombre) continue;
    const fide = (iFide >= 0 ? (c[iFide] ?? "") : "").trim();
    salida.push({
      idJugador: idsDeJugador(fila)[0] ?? null,
      nombre,
      // "-" es "no tiene", y guardarlo como texto sería cruzar a todos con todos.
      fideId: /^\d{3,12}$/.test(fide) ? fide : null,
    });
  }
  return salida;
}

/**
 * Los datos de cabecera del torneo: nombre, sede y en qué ronda va.
 *
 * SALEN DEL TEXTO Y NO DE UNA TABLA, porque su página los pinta en la cabecera. Se lee lo
 * que hay y lo que falte queda a null: es información de adorno —el nombre de verdad es el
 * que tiene el torneo en NUESTRA app— así que no merece un parser frágil.
 */
export function parsearCabeceraPublica(html: string): {
  nombre: string | null;
  ronda: number | null;
  rondasTotales: number | null;
} {
  const titulo = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  // Su título es "Standings - NOMBRE DEL TORNEO - ChessPairings".
  const partes = texto(titulo).split(" - ");
  const nombre = partes.length >= 3 ? partes.slice(1, -1).join(" - ") : null;
  const ronda = /Round\s+(\d+)\s+of\s+(\d+)/i.exec(texto(html));
  return {
    nombre: nombre || null,
    ronda: ronda ? Number(ronda[1]) : null,
    rondasTotales: ronda ? Number(ronda[2]) : null,
  };
}
