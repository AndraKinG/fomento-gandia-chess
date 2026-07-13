import * as XLSX from "xlsx";

// Encabezados reales de la lista FEDA (verificado contra el fixture
// "feda-lista.xlsx", hoja "Elo Octubre 2023"): la columna de identificador
// de jugador es "Id. FEDA" y la de puntuación es "Elo" (no "IDFEDA"/"ELO").
const COL_ID = "Id. FEDA";
const COL_ELO = "Elo";

/** Parsea la lista mensual de ELO de la FEDA (xlsx) a un mapa feda_id -> elo. */
export function parseListaFeda(buffer: ArrayBuffer): Map<string, number> {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const mapa = new Map<string, number>();
  for (const row of rows) {
    const id = row[COL_ID];
    const elo = Number(row[COL_ELO]);
    if (id != null && Number.isFinite(elo) && elo > 0) {
      mapa.set(String(id).trim(), elo);
    }
  }
  return mapa;
}

/** Devuelve la URL del primer enlace .xlsx de la página de listas ELO FEDA (la más reciente, ya que la página las lista de más nueva a más antigua). */
export function obtenerUrlUltimaListaFeda(html: string): string | null {
  const m = /href="([^"]+\.xlsx)"/i.exec(html);
  return m ? m[1] : null;
}
