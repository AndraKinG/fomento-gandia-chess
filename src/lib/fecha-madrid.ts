import { offsetMadrid } from "@/lib/import/facv-calendario";

/**
 * Fecha (YYYY-MM-DD) del calendario de Madrid en la que cae un instante
 * timestamptz (tal y como lo devuelve Supabase, en UTC). Usa `Intl` con la
 * zona horaria explícita para no depender de en qué zona corre el proceso
 * Node (dev local vs. Vercel) ni de la aritmética manual de DST.
 */
export function fechaMadrid(fechaHoraISO: string): string {
  // El formato "en-CA" es el truco habitual para obtener YYYY-MM-DD de Intl.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
    new Date(fechaHoraISO)
  );
}

/** Día siguiente a `fecha` (YYYY-MM-DD), en aritmética UTC pura (sin DST). */
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Límites [desde, hasta) en timestamptz UTC del día `fecha` (YYYY-MM-DD) tal
 * y como transcurre en Madrid, para usar en comparaciones `>= desde AND <
 * hasta` sobre columnas `fecha_hora`.
 */
export function limitesDiaMadrid(fecha: string): { desde: string; hasta: string } {
  const manana = diaSiguiente(fecha);
  return {
    desde: `${fecha}T00:00:00${offsetMadrid(fecha)}`,
    hasta: `${manana}T00:00:00${offsetMadrid(manana)}`,
  };
}
