/**
 * Parte una lista larga en dos columnas para las pantallas anchas.
 *
 * POR QUÉ: las listas del club son altas y estrechas —el ranking oficial son 46
 * filas de cuatro datos—, y en un monitor gastaban metro y medio de scroll mientras
 * dejaban media pantalla en blanco a la derecha. Partirlas en dos usa el ancho, que
 * es lo que sobra, en vez del alto, que es lo que falta.
 *
 * Devuelve SIEMPRE un array de trozos (uno o dos) para que quien lo pinta no tenga
 * que ramificar: se recorre igual en los dos casos.
 */

/** Por debajo de esto no se parte: dos columnas de seis filas no ganan nada y
 *  encima obligan a leer en zigzag. */
export const MINIMO_PARA_PARTIR = 24;

export function partirEnDos<T>(
  lista: readonly T[],
  minimo: number = MINIMO_PARA_PARTIR
): T[][] {
  if (lista.length <= minimo) return [[...lista]];
  // Techo, no suelo: con un número impar de filas la columna larga es la primera,
  // que es como se lee una lista partida (se llena la izquierda y luego la derecha).
  const corte = Math.ceil(lista.length / 2);
  return [lista.slice(0, corte), lista.slice(corte)];
}

/** Posición global en la que empieza cada trozo, para las listas numeradas: el
 *  índice local de la segunda columna volvería a empezar por 1. */
export function inicioDelTrozo<T>(trozos: T[][], n: number): number {
  let inicio = 0;
  for (let i = 0; i < n; i++) inicio += trozos[i].length;
  return inicio;
}
