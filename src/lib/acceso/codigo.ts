import { randomBytes } from "node:crypto";

/**
 * Alfabeto sin caracteres ambiguos: fuera `I`, `O`, `0` y `1`. El código se
 * dicta por teléfono y se copia a mano desde WhatsApp, así que confundir una
 * O con un cero es un fallo de diseño, no del socio.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Longitud del código. 12 caracteres de este alfabeto son ~60 bits. */
const LONGITUD = 12;

/**
 * Genera un código de acceso al club. Aleatorio de verdad (`randomBytes`), no
 * elegido a mano: un código tipo "AJEDREZ2026" es adivinable por cualquiera
 * que sepa de qué club se trata.
 *
 * El `% 32` no introduce sesgo porque 256 es múltiplo exacto de 32: cada letra
 * del alfabeto sale de 8 valores de byte, el reparto es uniforme.
 */
export function generarCodigo(): string {
  const bytes = randomBytes(LONGITUD);
  return Array.from(bytes)
    .map((b) => ALFABETO[b % ALFABETO.length])
    .join("");
}

/**
 * Normaliza lo que teclea el socio para compararlo con el guardado: mayúsculas
 * y sin nada que no sea del alfabeto (espacios, guiones del formato
 * `CDRL-85C3-CAP6`, saltos de línea al pegar desde WhatsApp).
 *
 * NO corrige confusiones de caracteres (O -> 0) porque el alfabeto ya las
 * evita: si aparece una `O` es que el código está mal, y hacerla pasar por `0`
 * solo enmascararía el error.
 */
export function normalizarCodigo(entrada: string): string {
  return entrada.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

/** Formato bonito para mostrarlo en /admin: `CDRL-85C3-CAP6`. */
export function formatearCodigo(codigo: string): string {
  return (normalizarCodigo(codigo).match(/.{1,4}/g) ?? []).join("-");
}
