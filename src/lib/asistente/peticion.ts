import type { Turno } from "./gemini";

/**
 * Validación de lo que manda el navegador al asistente.
 *
 * APARTE Y CON TESTS porque esto es la puerta: el historial lo compone el cliente y
 * va derecho a una llamada que consume la cuota del club. Aquí no se confía en la
 * forma ni en el tamaño de nada.
 */

/** Tope de la pregunta. Nadie escribe 2.000 caracteres en un chat de club: quien lo
 *  hace está pegando algo, y pegar algo enorme se come la cuota gratuita. */
export const TOPE_MENSAJE = 2000;

/** Turnos de contexto. Suficiente para seguir el hilo, y corta la conversación que
 *  crece sin fin y encarece cada pregunta. */
export const TOPE_HISTORIAL = 12;

/** Devuelve los turnos válidos, o null si lo que llega no tiene la forma esperada. */
export function leerHistorial(valor: unknown): Turno[] | null {
  if (!Array.isArray(valor)) return null;
  const turnos: Turno[] = [];
  // Se recorta ANTES de validar: lo que sobra ni se mira.
  for (const t of valor.slice(-TOPE_HISTORIAL)) {
    if (typeof t !== "object" || t === null) return null;
    const { papel, texto } = t as { papel?: unknown; texto?: unknown };
    if (papel !== "usuario" && papel !== "asistente") return null;
    if (typeof texto !== "string") return null;
    const limpio = texto.trim().slice(0, TOPE_MENSAJE);
    // Un turno vacío se cae solo: no aporta nada y Gemini rechaza las partes vacías.
    if (limpio) turnos.push({ papel, texto: limpio });
  }
  return turnos;
}

/** true si el historial acaba en una pregunta del socio, que es lo único que tiene
 *  sentido mandar: si acaba en respuesta, no hay nada que contestar. */
export function acabaEnPregunta(turnos: Turno[]): boolean {
  return turnos.length > 0 && turnos[turnos.length - 1].papel === "usuario";
}
