/**
 * Política de avisos: a quién se le manda push y qué hacer con los fallos.
 *
 * PURO a propósito: decide, no ejecuta. Lo que toca Supabase o el servicio de
 * push (leer suscripciones, mandar el POST, borrar filas) va en otro módulo,
 * que puede probarse contra una base real sin arrastrar esta lógica, y esta
 * lógica puede probarse sin arrastrar la base.
 */

export type GrupoAviso = "interclubs" | "torneos" | "partidas" | "gestion";

export type TipoAviso =
  | "convocatoria"
  | "disponibilidad_peticion"
  | "disponibilidad_recordatorio"
  | "torneo_interes"
  | "torneo_primer_apuntado"
  | "coche_plaza_libre"
  | "coche_sin_plaza"
  | "reto_aceptado"
  | "alta_socio"
  | "vinculacion"
  | "fichas_nuevas";

/** A qué grupo pertenece cada tipo (tabla de la spec): así se silencia por grupo. */
export const GRUPO_DE: Record<TipoAviso, GrupoAviso> = {
  convocatoria: "interclubs",
  disponibilidad_peticion: "interclubs",
  disponibilidad_recordatorio: "interclubs",
  torneo_interes: "torneos",
  torneo_primer_apuntado: "torneos",
  coche_plaza_libre: "torneos",
  coche_sin_plaza: "torneos",
  reto_aceptado: "partidas",
  alta_socio: "gestion",
  vinculacion: "gestion",
  fichas_nuevas: "gestion",
};

/**
 * Tipos que ignoran el silencio del socio (decisión del propietario).
 *
 * Solo la convocatoria: si el capitán te convoca, te enteras aunque hayas
 * silenciado Interclubs, porque de eso depende si vas a jugar o no.
 */
export const NO_SILENCIABLES: readonly TipoAviso[] = ["convocatoria"];

/** ¿Se le manda push a este socio por este aviso? */
export function debePush(
  tipo: TipoAviso,
  destinatario: { silenciados: string[]; tieneSuscripcion: boolean }
): boolean {
  // Sin suscripción no hay dónde mandarlo. No es un fallo: el aviso se queda
  // en la bandeja igual, así que esto no es "fallido", es que no aplica.
  if (!destinatario.tieneSuscripcion) return false;

  if (NO_SILENCIABLES.includes(tipo)) return true;

  return !destinatario.silenciados.includes(GRUPO_DE[tipo]);
}

/** Qué hacer con un fallo de envío, según lo que respondió el servicio de push. */
export function tratarFallo(
  statusCode: number | undefined
): { estado: "no_tocaba"; borrarSuscripcion: true } | { estado: "fallido"; borrarSuscripcion: false } {
  // 404/410: el navegador ya no reconoce esa suscripción (desinstalada,
  // caducada...). Reintentar es tirar el aviso a un buzón que ya no existe;
  // lo que corresponde es limpiar la suscripción, no marcarlo como fallo.
  if (statusCode === 404 || statusCode === 410) {
    return { estado: "no_tocaba", borrarSuscripcion: true };
  }
  return { estado: "fallido", borrarSuscripcion: false };
}

/** ¿Se reintenta este aviso fallido? Una sola vez (spec). */
export function debeReintentar(aviso: { push: string; push_intentos: number }): boolean {
  return aviso.push === "fallido" && aviso.push_intentos < 1;
}
