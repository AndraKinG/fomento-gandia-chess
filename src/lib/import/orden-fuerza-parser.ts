export type FilaOrden = {
  numero: number;
  bisIndex: number;
  nombre: string;
  fideId: string | null;
  fedaId: string | null;
};
export type ErrorLinea = { linea: number; motivo: string };

const NUM_RE = /^(\d+)(bis)?$/i;

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
    vistos.add(clave);
    const nombre = cols[1] ?? "";
    if (!nombre) {
      errores.push({ linea, motivo: "Falta el nombre" });
      return;
    }
    filas.push({
      numero,
      bisIndex,
      nombre,
      fideId: cols[2] || null,
      fedaId: cols[3] || null,
    });
  });
  return { filas, errores };
}
