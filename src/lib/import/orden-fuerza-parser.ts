export type FilaOrden = {
  numero: number;
  bisIndex: number;
  nombre: string;
  fideId: string | null;
  fedaId: string | null;
};
export type ErrorLinea = { linea: number; motivo: string };

const NUM_RE = /^(\d+)(bis)?$/i;
const ID_RE = /^\d+$/;

export function parseOrdenFuerza(texto: string): {
  filas: FilaOrden[];
  errores: ErrorLinea[];
} {
  const filas: FilaOrden[] = [];
  const errores: ErrorLinea[] = [];
  const vistos = new Set<string>();

  texto.split(/\r?\n/).forEach((raw, i) => {
    const linea = i + 1;
    if (!raw.trim()) return;
    const cols = raw.split(/\t|;/).map((c) => c.trim());
    const m = NUM_RE.exec(cols[0] ?? "");
    if (!m) {
      errores.push({ linea, motivo: "Número de orden no reconocido" });
      return;
    }
    const numero = Number(m[1]);
    const bisIndex = m[2] ? 1 : 0;
    const clave = `${numero}/${bisIndex}`;
    if (vistos.has(clave)) {
      errores.push({
        linea,
        motivo: `Número ${numero}${bisIndex ? "bis" : ""} duplicado`,
      });
      return;
    }
    const nombre = cols[1] ?? "";
    if (!nombre) {
      errores.push({ linea, motivo: "Falta el nombre" });
      return;
    }
    const fideId = cols[2] || null;
    const fedaId = cols[3] || null;
    if ((fideId && !ID_RE.test(fideId)) || (fedaId && !ID_RE.test(fedaId))) {
      errores.push({ linea, motivo: "ID federativo no numérico" });
      return;
    }
    vistos.add(clave);
    filas.push({
      numero,
      bisIndex,
      nombre,
      fideId,
      fedaId,
    });
  });
  return { filas, errores };
}
