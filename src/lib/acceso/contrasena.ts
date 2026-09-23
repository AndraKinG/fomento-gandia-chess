/**
 * Qué vale como contraseña y qué se le dice al socio si no.
 *
 * MÓDULO APARTE porque lo usan dos pantallas —la de poner una nueva tras recuperarla y,
 * si algún día se añade, la de cambiarla desde el perfil— y porque el mensaje de error
 * es la mitad del trabajo: "contraseña no válida" deja a alguien probando a ciegas.
 *
 * EL MÍNIMO SON 8 Y NO ES UNA OPINIÓN: es lo que exige Supabase por defecto. Si aquí
 * dejáramos pasar 6, el socio rellenaría el formulario, le saldría un error del servidor
 * en inglés y no sabría qué ha hecho mal.
 *
 * NO SE RECORTAN LOS ESPACIOS. Da la tentación, porque el teclado del móvil añade uno al
 * final más veces de las que parece, pero recortarlos aquí guardaría una contraseña
 * distinta de la que el socio cree haber escrito, y al entrar por `signInWithPassword`
 * —que no recorta nada— no le valdría. Se avisa, que es lo honesto.
 */

export const LARGO_MINIMO = 8;

export type Validacion = { ok: true } | { ok: false; error: string };

/**
 * Las dos veces que se escribe, comparadas.
 *
 * SE PIDE DOS VECES a propósito: quien acaba de recuperar el acceso no puede permitirse
 * una errata, porque la siguiente pantalla es el inicio de sesión y volvería a quedarse
 * fuera, esta vez sin saber por qué.
 */
export function validarContrasena(primera: string, repetida: string): Validacion {
  if (primera !== repetida) {
    return { ok: false, error: "Las dos contraseñas no son iguales." };
  }
  if (primera.length < LARGO_MINIMO) {
    return {
      ok: false,
      error: `La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`,
    };
  }
  if (primera.trim().length === 0) {
    return { ok: false, error: "La contraseña no puede ser solo espacios." };
  }
  if (primera !== primera.trim()) {
    return {
      ok: false,
      error: "La contraseña empieza o acaba con un espacio. Quítalo, o no podrás entrar.",
    };
  }
  return { ok: true };
}
