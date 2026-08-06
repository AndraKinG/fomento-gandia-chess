import { normalizaNombre } from "@/lib/import/facv-calendario";

/**
 * Cruce de nombres de personas entre fuentes que no los escriben igual.
 *
 * EL PROBLEMA, medido sobre los datos reales del club: `players.nombre` tiene DOS
 * FORMATOS mezclados —"Aalbersberg Kroon, Pedro" en las fichas que vinieron del orden
 * de fuerza de la FACV y "Borja Gregori Olivares" en las que se metieron a mano— y las
 * actas de chess-results usan siempre el primero. Comparando las cadenas normalizadas
 * cruzaban CERO de 248 tableros, y el fallo no daba ningún error: simplemente ninguna
 * fila quedaba enlazada a su socio.
 *
 * LA SOLUCIÓN es comparar el CONJUNTO de palabras, que no depende del orden:
 * "Gregori Olivares, Borja" y "Borja Gregori Olivares" dan los dos
 * {borja, gregori, olivares}.
 *
 * Y PARA QUE NO ATRIBUYA UNA PARTIDA A QUIEN NO ES: si dos fichas distintas dan el
 * mismo conjunto, ninguna de las dos se enlaza. Es preferible dejar el tablero sin
 * ficha —se enseña igual, con el nombre del acta— que colgársela al socio equivocado.
 */

/**
 * Conjunto de palabras del nombre, en orden alfabético y sin acentos.
 *
 * SE TIRA EL AÑO DE NACIMIENTO. Cuando dos jugadores del mismo grupo se llaman igual,
 * chess-results se lo añade al nombre para distinguirlos: "Gonzalez Rodriguez, Manuel
 * 1969". Eso es una marca de la fuente, no parte del nombre, y sin quitarla ese socio
 * no cruza con su ficha. Solo se tira si va suelto y parece un año (1900-2099), para
 * no cargarse un apellido con números, que no existe pero tampoco cuesta nada evitar.
 */
export function claveNombre(nombre: string): string {
  return normalizaNombre(nombre)
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^(?:19|20)\d{2}$/.test(p))
    .sort()
    .join(" ");
}

export type FichaConNombre = { id: string; nombre: string };

/**
 * Índice de nombre → id de ficha, saltándose las claves ambiguas.
 *
 * Las claves que apuntarían a más de una ficha se eliminan del índice, no se quedan
 * con la primera.
 */
export function indicePorNombre(fichas: readonly FichaConNombre[]): Map<string, string> {
  const cuantas = new Map<string, number>();
  const indice = new Map<string, string>();
  for (const f of fichas) {
    const clave = claveNombre(f.nombre);
    if (!clave) continue;
    cuantas.set(clave, (cuantas.get(clave) ?? 0) + 1);
    indice.set(clave, f.id);
  }
  for (const [clave, n] of cuantas) {
    if (n > 1) indice.delete(clave);
  }
  return indice;
}

/** Id de la ficha que corresponde a `nombre`, o null si no hay una sola clara. */
export function buscarFicha(nombre: string, indice: Map<string, string>): string | null {
  return indice.get(claveNombre(nombre)) ?? null;
}
