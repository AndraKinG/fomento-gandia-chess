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

/**
 * Formatea un instante ISO (timestamptz) para mostrarlo en pantalla, siempre
 * en la zona horaria de Madrid y locale es-ES — sin esto, cada pantalla que
 * usa `new Date(...).toLocaleString(...)` sin `timeZone` explícito muestra
 * una hora distinta según en qué TZ corre el proceso Node (dev local vs.
 * Vercel en UTC). Centraliza aquí el formateo para que no se repita (ni se
 * olvide) el `timeZone: "Europe/Madrid"` en cada pantalla.
 *
 * Devuelve "Sin fecha" si `fechaHoraISO` es null o no es una fecha válida.
 * `opciones` se pasan tal cual a `toLocaleString`, salvo `timeZone` que
 * siempre se fuerza a "Europe/Madrid".
 */
export function formatearFechaMadrid(
  fechaHoraISO: string | null,
  opciones?: Intl.DateTimeFormatOptions
): string {
  if (!fechaHoraISO) return "Sin fecha";
  const fecha = new Date(fechaHoraISO);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleString("es-ES", { ...opciones, timeZone: "Europe/Madrid" });
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
