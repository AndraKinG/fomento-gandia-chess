import * as XLSX from "xlsx";

// Encabezados reales de la lista FEDA (verificado contra el fixture
// "feda-lista.xlsx", hoja "Elo Octubre 2023"): la columna de identificador
// de jugador es "Id. FEDA" y la de puntuación es "Elo" (no "IDFEDA"/"ELO").
// La lista trae TAMBIÉN el id FIDE, y eso es lo que la hace utilizable: las
// fichas del club tienen `fide_id` y ninguna tiene `feda_id`.
const COL_ID_FEDA = "Id. FEDA";
const COL_ID_FIDE = "Id. Fide";
const COL_ELO = "Elo";

/** Una fila de la lista, con los dos identificadores para poder cruzar por cualquiera. */
export type FilaFeda = {
  fedaId: string;
  /** null si la fila no trae id FIDE (hay jugadores solo federados en España). */
  fideId: string | null;
  elo: number;
};

export type ListaFeda = {
  /** Por id FEDA. */
  porFeda: Map<string, FilaFeda>;
  /** Por id FIDE. Es el índice que de verdad usa el club. */
  porFide: Map<string, FilaFeda>;
};

/**
 * Parsea la lista mensual de ELO de la FEDA (xlsx).
 *
 * SE INDEXA POR LOS DOS IDENTIFICADORES a propósito. El importador cruzaba solo por
 * `feda_id` y **ninguna de las 46 fichas del club lo tiene** —todas tienen `fide_id`,
 * que es lo que publica el orden de fuerza de la FACV—, así que no podía actualizar a
 * nadie: acababa siempre en "0 actualizados" sin dar ningún error.
 */
export function parseListaFeda(buffer: ArrayBuffer): ListaFeda {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const porFeda = new Map<string, FilaFeda>();
  const porFide = new Map<string, FilaFeda>();
  for (const row of rows) {
    const fedaId = row[COL_ID_FEDA];
    const elo = Number(row[COL_ELO]);
    if (fedaId == null || !Number.isFinite(elo) || elo <= 0) continue;
    const fideBruto = row[COL_ID_FIDE];
    const fideId =
      fideBruto == null || String(fideBruto).trim() === ""
        ? null
        : String(fideBruto).trim();
    const fila: FilaFeda = { fedaId: String(fedaId).trim(), fideId, elo };
    porFeda.set(fila.fedaId, fila);
    if (fila.fideId) porFide.set(fila.fideId, fila);
  }
  return { porFeda, porFide };
}

/** Año y mes de un enlace de lista FEDA ("…/2023_12_FEDA.xlsx" -> 202312). */
export function fechaDeListaFeda(url: string): number | null {
  const m = /(\d{4})_(\d{2})_FEDA/i.exec(url);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(m[2]);
}

/**
 * URL de la lista FEDA más reciente de la página oficial.
 *
 * SE ELIGE POR LA FECHA DEL NOMBRE, no por el orden en que aparecen. La página los
 * lista desordenados —comprobado: 12, 06, 11, 05, 10…— así que quedarse con el primer
 * enlace daba la más reciente por casualidad.
 */
export function obtenerUrlUltimaListaFeda(html: string): string | null {
  const enlaces = [...new Set([...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]))];
  let mejor: { url: string; fecha: number } | null = null;
  for (const url of enlaces) {
    const fecha = fechaDeListaFeda(url);
    if (fecha === null) continue;
    if (!mejor || fecha > mejor.fecha) mejor = { url, fecha };
  }
  // Sin ninguna fecha reconocible se cae al primer .xlsx, que es lo que hacía antes.
  return mejor?.url ?? enlaces[0] ?? null;
}
