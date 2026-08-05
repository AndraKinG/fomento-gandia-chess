/**
 * Validación de una partida antes de guardarla.
 *
 * Módulo puro: sin base de datos ni red. Lo que se valida aquí es lo que un
 * formulario no puede garantizar por sí solo (coherencia entre campos, rangos
 * razonables, limpieza del PGN).
 */

export type Color = "blancas" | "negras";
export type Resultado = "1" | "0.5" | "0";

export type DatosPartida = {
  fecha: string;
  rivalNombre: string;
  color: string;
  resultado: string;
  ronda?: string;
  rivalElo?: string;
  miElo?: string;
  torneoTexto?: string;
  apertura?: string;
  notas?: string;
  pgn?: string;
};

export type PartidaLimpia = {
  fecha: string;
  rivalNombre: string;
  color: Color;
  resultado: Resultado;
  ronda: number | null;
  rivalElo: number | null;
  miElo: number | null;
  torneoTexto: string | null;
  apertura: string | null;
  notas: string | null;
  pgn: string | null;
};

export type Validacion =
  | { ok: true; datos: PartidaLimpia }
  | { ok: false; error: string };

const COLORES: Color[] = ["blancas", "negras"];
const RESULTADOS: Resultado[] = ["1", "0.5", "0"];

/** Rango de ELO admitido. Generoso a propósito: hay listas históricas raras. */
const ELO_MIN = 0;
const ELO_MAX = 3500;

const MAX_NOMBRE = 100;
const MAX_NOTAS = 5000;
const MAX_PGN = 100_000;

function limpiar(t: string | undefined): string {
  return (t ?? "").replace(/[ \t]+/g, " ").trim();
}

/**
 * Convierte un campo de texto a entero, distinguiendo "vacío" de "basura".
 * Un formulario manda "" cuando el usuario no escribe nada, y eso es null, no 0.
 */
function aEntero(
  texto: string | undefined,
  etiqueta: string
): { ok: true; valor: number | null } | { ok: false; error: string } {
  const t = limpiar(texto);
  if (!t) return { ok: true, valor: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: `${etiqueta} tiene que ser un número.` };
  return { ok: true, valor: Number(t) };
}

/**
 * Comprobación de PGN deliberadamente laxa: que contenga algo que se parezca a
 * una jugada (`1.e4`, `1. e4`) o a una cabecera (`[Event "..."]`).
 *
 * Validar PGN de verdad exige un parser completo —variantes, comentarios
 * anidados, NAGs— y no es lo que hace falta aquí: el objetivo es cazar el pegado
 * accidental de otra cosa, no certificar la partida. Si el PGN está mal, se verá
 * al reproducirlo.
 */
export function parecePGN(texto: string): boolean {
  return /\[\s*\w+\s+"/.test(texto) || /\b1\s*\.\s*[A-Za-z]/.test(texto);
}

export function validarPartida(datos: DatosPartida): Validacion {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return { ok: false, error: "Pon la fecha de la partida." };
  }

  const rivalNombre = limpiar(datos.rivalNombre);
  if (rivalNombre.length < 2) return { ok: false, error: "Escribe el nombre del rival." };
  if (rivalNombre.length > MAX_NOMBRE) {
    return { ok: false, error: "El nombre del rival es demasiado largo." };
  }

  if (!COLORES.includes(datos.color as Color)) {
    return { ok: false, error: "Di con qué color jugaste." };
  }
  if (!RESULTADOS.includes(datos.resultado as Resultado)) {
    return { ok: false, error: "Di cómo acabó la partida." };
  }

  const ronda = aEntero(datos.ronda, "La ronda");
  if (!ronda.ok) return { ok: false, error: ronda.error };
  if (ronda.valor !== null && ronda.valor < 1) {
    return { ok: false, error: "La ronda empieza en 1." };
  }

  const rivalElo = aEntero(datos.rivalElo, "El ELO del rival");
  if (!rivalElo.ok) return { ok: false, error: rivalElo.error };
  const miElo = aEntero(datos.miElo, "Tu ELO");
  if (!miElo.ok) return { ok: false, error: miElo.error };

  for (const [valor, etiqueta] of [
    [rivalElo.valor, "El ELO del rival"],
    [miElo.valor, "Tu ELO"],
  ] as const) {
    if (valor !== null && (valor < ELO_MIN || valor > ELO_MAX)) {
      return { ok: false, error: `${etiqueta} no parece un ELO válido.` };
    }
  }

  const pgnCrudo = (datos.pgn ?? "").trim();
  if (pgnCrudo && !parecePGN(pgnCrudo)) {
    return {
      ok: false,
      error: "Eso no parece un PGN. Debe llevar las jugadas (1.e4 e5...) o las cabeceras [Event ...].",
    };
  }

  return {
    ok: true,
    datos: {
      fecha: datos.fecha,
      rivalNombre,
      color: datos.color as Color,
      resultado: datos.resultado as Resultado,
      ronda: ronda.valor,
      rivalElo: rivalElo.valor,
      miElo: miElo.valor,
      torneoTexto: limpiar(datos.torneoTexto) || null,
      apertura: limpiar(datos.apertura) || null,
      // Notas y PGN conservan los saltos de línea: en el PGN son significativos
      // y en las notas la gente escribe párrafos.
      notas: (datos.notas ?? "").trim().slice(0, MAX_NOTAS) || null,
      pgn: pgnCrudo.slice(0, MAX_PGN) || null,
    },
  };
}

/** Cómo se lee un resultado desde el punto de vista del dueño de la partida. */
export function textoResultado(resultado: Resultado): string {
  return resultado === "1" ? "Victoria" : resultado === "0" ? "Derrota" : "Tablas";
}
