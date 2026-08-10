/**
 * Los juegos de piezas entre los que puede elegir cada socio, igual que los
 * temas del tablero (ver temas.ts, que es el espejo de este fichero).
 *
 * CADA JUEGO ES UNA CARPETA en `public/piezas/<clave>/` con los 12 SVG
 * (`wK.svg`…`bP.svg`, el formato que devuelve chess.js). Añadir un juego es
 * añadir una carpeta con esos nombres Y su licencia en LICENCIA.md — solo arte
 * permisivo (MIT, Apache, CC0): cburnett y merida, los más famosos, son GPLv2+
 * y meter copyleft fuerte aquí es un lío que no hace falta buscarse.
 *
 * La elección se guarda en `profiles.juego_piezas` (migración 0031) y viaja con
 * la cuenta, como el tema del tablero.
 */

export type JuegoPiezas = {
  /** Clave que se guarda en la base y nombre de la carpeta. No cambiarla. */
  clave: string;
  /** Nombre que se enseña en el selector. */
  nombre: string;
};

export const JUEGOS_PIEZAS: readonly JuegoPiezas[] = [
  // El de siempre, primero porque es el default: silueta Staunton clásica.
  { clave: "celtic", nombre: "Clásicas" },
  { clave: "chessnut", nombre: "Modernas" },
  { clave: "fantasy", nombre: "Fantasía" },
  { clave: "spatial", nombre: "Espaciales" },
];

export const JUEGO_POR_DEFECTO = JUEGOS_PIEZAS[0];

/** El juego de una clave guardada, con la misma red que `temaTablero`. */
export function juegoPiezas(clave: string | null | undefined): JuegoPiezas {
  return JUEGOS_PIEZAS.find((j) => j.clave === clave) ?? JUEGO_POR_DEFECTO;
}

/** ¿Es una clave que se puede guardar? Lo comprueba la acción antes de escribir. */
export function esJuegoValido(clave: string): boolean {
  return JUEGOS_PIEZAS.some((j) => j.clave === clave);
}

/** Ruta del SVG de una pieza en un juego. Única fuente del formato de ruta. */
export function rutaPieza(juego: string, color: "w" | "b", tipo: string): string {
  return `/piezas/${juego}/${color}${tipo.toUpperCase()}.svg`;
}
