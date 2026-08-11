/**
 * Hora de juego de una ronda: cuándo toca avisar y cómo se dice.
 *
 * MÓDULO PURO: decide con la hora de la ronda y la hora actual, y no toca ni la
 * base ni el push. Lo que sí las toca vive en `avisar-rondas.ts` (el servidor) y en
 * `components/torneos/ProximaRonda.tsx` (la tarjeta). Así el "¿toca ya?" —que es
 * justo lo que se puede equivocar sin que nadie lo note hasta el día del torneo—
 * se prueba sin base de datos y sin esperar una hora.
 *
 * LAS DOS VENTANAS SON DISTINTAS A PROPÓSITO:
 * - El PUSH sale una vez, entre 60 y 55 minutos antes (el programador pasa cada
 *   cinco). Nunca después de la hora: un "empieza en una hora" que llega cuando la
 *   ronda ya ha empezado es peor que no avisar.
 * - La TARJETA de dentro de la app sigue un rato después de la hora, porque quien
 *   abre la app a las 19:05 necesita justamente ese enlace.
 */

/** Cuánto antes se avisa. Lo pidió así el propietario: una hora. */
export const MINUTOS_DE_AVISO = 60;

/**
 * Cuánto sigue la tarjeta después de la hora de la ronda.
 *
 * Media hora: el que llega tarde es el que más necesita el enlace a su partida. Se
 * corta en algún punto porque una tarjeta que no se va nunca deja de ser un aviso y
 * pasa a ser un adorno.
 */
export const MINUTOS_DE_GRACIA = 30;

/** Minutos desde `ahora` hasta la hora de la ronda. Negativo si ya pasó. */
export function minutosHasta(fechaHoraISO: string, ahora: Date): number {
  const cuando = new Date(fechaHoraISO).getTime();
  if (Number.isNaN(cuando)) return Number.NaN;
  return Math.round((cuando - ahora.getTime()) / 60000);
}

/**
 * ¿Le toca el push a esta ronda?
 *
 * Sin hora no hay nada que avisar; con la marca puesta, ya se avisó (la pone el
 * servidor ANTES de enviar, ver la migración 0037); y pasada la hora, ya no.
 */
export function tocaAvisar(
  ronda: { fechaHora: string | null; avisoEnviadoEn: string | null },
  ahora: Date
): boolean {
  if (!ronda.fechaHora || ronda.avisoEnviadoEn) return false;
  const faltan = minutosHasta(ronda.fechaHora, ahora);
  if (Number.isNaN(faltan)) return false;
  return faltan >= 0 && faltan <= MINUTOS_DE_AVISO;
}

/** ¿Se enseña la tarjeta de "tu ronda empieza" dentro de la app? */
export function tocaLaTarjeta(fechaHoraISO: string | null, ahora: Date): boolean {
  if (!fechaHoraISO) return false;
  const faltan = minutosHasta(fechaHoraISO, ahora);
  if (Number.isNaN(faltan)) return false;
  return faltan <= MINUTOS_DE_AVISO && faltan >= -MINUTOS_DE_GRACIA;
}

/** Cuenta atrás en texto, para la tarjeta. */
export function textoCuentaAtras(minutos: number): string {
  if (Number.isNaN(minutos)) return "";
  if (minutos <= 0) return "Ya ha empezado";
  if (minutos === 1) return "Empieza en 1 minuto";
  if (minutos < 60) return `Empieza en ${minutos} min`;
  return "Empieza en 1 h";
}

/**
 * La hora sola ("19:00"), en hora de Madrid.
 *
 * SIEMPRE con la zona explícita: el push lo escribe el servidor, que en Vercel corre
 * en UTC, así que sin esto un torneo de las 19:00 se anunciaría a las 17:00.
 */
export function horaCorta(fechaHoraISO: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(fechaHoraISO));
}

/** Día y hora cortos ("mié 19, 19:00"), para las cabeceras de ronda. */
export function diaYHora(fechaHoraISO: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(fechaHoraISO));
}
