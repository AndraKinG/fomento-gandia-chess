/**
 * Perfiles de las piezas para tornearlas en 3D.
 *
 * POR QUÉ TORNEADAS Y NO EXTRUIDAS, que fue el error del intento anterior: una pieza de
 * ajedrez de verdad SE TORNEA — sale de un perfil girado sobre su eje. Extruir la
 * silueta plana del SVG daba figuras de cartón recortado, y en pantalla se veía
 * exactamente eso. Con el perfil girado, la pieza tiene volumen real por todos lados y
 * la luz la recorre como recorrería una de madera.
 *
 * CADA PERFIL ES UNA LISTA DE PUNTOS `[radio, altura]`, de abajo arriba, en unidades de
 * casilla (una casilla = 1). Girándolos 360° sale la pieza. Es la misma cuenta que hace
 * un tornero: el perfil ES la pieza.
 *
 * EL CABALLO NO SE PUEDE TORNEAR, y no se disimula: no es un sólido de revolución, así
 * que ese sigue saliendo de la silueta del SVG puesta de perfil — que es, además, como
 * se mira un caballo de ajedrez.
 *
 * MÓDULO PURO Y CON TESTS: son coordenadas, y unas coordenadas mal puestas dan una pieza
 * hundida en el tablero o del revés sin que nada falle. Comprobarlas aquí es más barato
 * que descubrirlo en una captura.
 */

/** Un punto del perfil: a qué distancia del eje y a qué altura. */
export type PuntoPerfil = { radio: number; altura: number };

export type TipoPieza = "P" | "R" | "B" | "Q" | "K";

/** De `[radio, altura]` a puntos, para que los perfiles se lean de un vistazo. */
function perfil(pares: readonly (readonly [number, number])[]): PuntoPerfil[] {
  return pares.map(([radio, altura]) => ({ radio, altura }));
}

/**
 * Los cinco perfiles. Las alturas siguen la jerarquía de un juego de verdad: el peón es
 * el más bajo y el rey el más alto, que es como se distinguen de un vistazo desde arriba.
 */
export const PERFILES: Record<TipoPieza, PuntoPerfil[]> = {
  // Peón: base ancha, cuello estrecho y bola.
  P: perfil([
    [0, 0], [0.30, 0], [0.30, 0.05], [0.24, 0.09], [0.14, 0.14],
    [0.12, 0.28], [0.19, 0.33], [0.13, 0.37], [0.17, 0.42],
    [0.17, 0.50], [0.10, 0.56], [0, 0.58],
  ]),
  // Torre: cilindro recto con el labio de arriba. Las almenas no se pueden tornear, y el
  // labio basta para que se lea como torre.
  R: perfil([
    [0, 0], [0.32, 0], [0.32, 0.06], [0.26, 0.11], [0.22, 0.16],
    [0.22, 0.46], [0.28, 0.50], [0.30, 0.58], [0.30, 0.62], [0, 0.62],
  ]),
  // Alfil: cuerpo cónico, collar y la mitra rematada en punta.
  B: perfil([
    [0, 0], [0.31, 0], [0.31, 0.05], [0.25, 0.10], [0.15, 0.16],
    [0.13, 0.40], [0.21, 0.45], [0.13, 0.49], [0.16, 0.56],
    [0.12, 0.66], [0.05, 0.74], [0.06, 0.78], [0, 0.80],
  ]),
  // Dama: como el alfil pero más alta y con la corona más ancha.
  Q: perfil([
    [0, 0], [0.34, 0], [0.34, 0.06], [0.27, 0.11], [0.16, 0.18],
    [0.14, 0.48], [0.24, 0.54], [0.15, 0.59], [0.23, 0.68],
    [0.20, 0.76], [0.09, 0.82], [0.10, 0.87], [0, 0.90],
  ]),
  // Rey: el más alto. La cruz de arriba va aparte (no se puede tornear).
  K: perfil([
    [0, 0], [0.35, 0], [0.35, 0.06], [0.28, 0.12], [0.17, 0.19],
    [0.15, 0.52], [0.25, 0.58], [0.16, 0.63], [0.22, 0.74],
    [0.18, 0.84], [0.10, 0.90], [0, 0.92],
  ]),
};

/** Altura total de una pieza, para colocar sombras y saber desde dónde cae. */
export function alturaDe(tipo: TipoPieza): number {
  return Math.max(...PERFILES[tipo].map((p) => p.altura));
}

/** El tipo de pieza de un sprite (`wQ` → `Q`). El caballo se marca aparte. */
export function tipoDeSprite(sprite: string): TipoPieza | "N" {
  const letra = sprite[1] as TipoPieza | "N";
  return letra;
}
