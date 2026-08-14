/**
 * Datos de la escena 3D del hero: qué piezas hay y dónde.
 *
 * APARTE Y PURO para poder probarlo sin WebGL. Todo lo que se pueda decidir con números
 * se decide aquí; el componente solo pinta. Es la misma lección de `proyeccion.ts`: la
 * parte que se equivoca en silencio es la de las coordenadas, y depurar eso a base de
 * recargar una escena 3D es aún peor que depurar CSS.
 */

/** Una pieza colocada en la escena, en unidades de tablero (una casilla = 1). */
export type PiezaEscena = {
  id: string;
  /** El fichero SVG del que sale la silueta: `wK`, `bP`… */
  sprite: string;
  /** Posición sobre el tablero. x a la derecha, z hacia la cámara. */
  x: number;
  z: number;
  /** Giro sobre su eje, en radianes: que no estén todas igual de rectas. */
  giro: number;
};

/**
 * La escena del hero: pocas piezas y grandes, no las treinta y dos.
 *
 * POR QUÉ NO EL TABLERO ENTERO. Con las 32 piezas cada una acaba midiendo cuatro píxeles
 * y no se distingue ninguna; con ocho bien colocadas y cerca de la cámara, se ve la
 * madera, la sombra y el volumen — que es de lo que iba todo esto. Es lo mismo que hace
 * un fotógrafo de producto: pocas cosas, grandes y bien iluminadas.
 *
 * La colocación no es una posición legal de ajedrez a propósito: es un bodegón. Los reyes
 * y la dama delante, un par de peones detrás para dar fondo, y hueco a la izquierda
 * porque ahí va el título.
 */
export const PIEZAS_HERO: readonly PiezaEscena[] = [
  { id: "rey-b", sprite: "wK", x: 1.15, z: 1.5, giro: -0.18 },
  { id: "dama-n", sprite: "bQ", x: 2.5, z: 0.55, giro: 0.22 },
  { id: "caballo-b", sprite: "wN", x: 0.1, z: 0.3, giro: -0.5 },
  { id: "alfil-n", sprite: "bB", x: 3.35, z: 1.75, giro: 0.1 },
  { id: "torre-b", sprite: "wR", x: -1.1, z: 1.35, giro: 0.3 },
  { id: "peon-n-1", sprite: "bP", x: 1.9, z: -1.15, giro: 0 },
  { id: "peon-b-1", sprite: "wP", x: 0.55, z: -1.5, giro: 0.4 },
  { id: "peon-n-2", sprite: "bP", x: 3.1, z: -0.7, giro: -0.25 },
];

/** El color de cada bando, en la madera del club. */
export const COLOR_PIEZA = {
  w: "#e8ddc8", // marfil cálido
  b: "#2b3a4a", // azul muy oscuro, del tema del club
} as const;

/** ¿De qué bando es un sprite? */
export function bandoDe(sprite: string): "w" | "b" {
  return sprite.startsWith("b") ? "b" : "w";
}

/**
 * Los seis SVG distintos que hay que cargar, sin repetir.
 *
 * Las piezas se repiten (dos peones negros, por ejemplo) y cada silueta cuesta parsear y
 * extruir: cargando la lista única, cada geometría se construye UNA vez y se reutiliza
 * en todas las instancias que la usen.
 */
export function spritesUnicos(piezas: readonly PiezaEscena[] = PIEZAS_HERO): string[] {
  return [...new Set(piezas.map((p) => p.sprite))];
}
