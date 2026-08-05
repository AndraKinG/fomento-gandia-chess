/**
 * Fechas de torneo. A diferencia de las jornadas de Interclubs, que son un
 * instante (`timestamptz`), un torneo es un RANGO DE DÍAS (`date`): puede durar
 * de un día a más de un mes, y la hora concreta la escribe el admin aparte
 * porque la FACV no la publica.
 *
 * Por eso no se reutiliza `fecha-madrid.ts`: ahí todo gira alrededor de
 * convertir instantes UTC a la zona de Madrid, y aquí no hay instantes ni zonas
 * que convertir — una columna `date` no tiene hora, y tratarla como si la
 * tuviera es la vía rápida a que un torneo se muestre un día antes.
 */

/** Hoy en Madrid, como `yyyy-mm-dd`, para comparar con columnas `date`. */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/**
 * Formatea una fecha `yyyy-mm-dd` sin pasar por husos horarios.
 *
 * Se construye a mediodía UTC a propósito: con `new Date("2026-01-03")` el
 * instante es medianoche UTC, que en zonas al oeste de Greenwich sigue siendo el
 * día 2. Mediodía deja margen en las dos direcciones.
 */
function partes(fecha: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    ...opciones,
  });
}

/**
 * Rango de un torneo en texto corto:
 *
 * - un solo día  → `"sáb, 3 ene"`
 * - mismo mes    → `"2 – 3 ene"`
 * - meses        → `"30 abr – 3 may"`
 * - años         → `"27 dic 2026 – 3 ene 2027"`
 */
export function formatearRangoFechas(inicio: string, fin: string): string {
  if (!inicio) return "Sin fecha";
  if (!fin || fin === inicio) {
    return partes(inicio, { weekday: "short", day: "numeric", month: "short" });
  }

  const anioInicio = inicio.slice(0, 4);
  const anioFin = fin.slice(0, 4);
  if (anioInicio !== anioFin) {
    return `${partes(inicio, { day: "numeric", month: "short", year: "numeric" })} – ${partes(fin, { day: "numeric", month: "short", year: "numeric" })}`;
  }

  const mismoMes = inicio.slice(5, 7) === fin.slice(5, 7);
  return mismoMes
    ? `${partes(inicio, { day: "numeric" })} – ${partes(fin, { day: "numeric", month: "short" })}`
    : `${partes(inicio, { day: "numeric", month: "short" })} – ${partes(fin, { day: "numeric", month: "short" })}`;
}

/** true si el torneo ya ha terminado (su último día es anterior a hoy). */
export function haTerminado(fin: string, hoy = hoyISO()): boolean {
  return fin < hoy;
}

/** true si hoy cae dentro del torneo. */
export function estaEnCurso(inicio: string, fin: string, hoy = hoyISO()): boolean {
  return inicio <= hoy && hoy <= fin;
}
