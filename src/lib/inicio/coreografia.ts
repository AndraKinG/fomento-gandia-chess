/**
 * La coreografía del hero: los tres actos del plano, en números.
 *
 * EL PLANO, tal y como lo pidió el propietario: la cámara va hacia atrás y va apareciendo
 * el tablero → las piezas caen desde arriba hasta completarlo → transición a vista
 * cenital.
 *
 * ESTÁ AQUÍ Y NO EN EL COMPONENTE porque es lo único de una escena 3D que se puede
 * comprobar sin verla. Las cuatro versiones anteriores del hero fallaron por cosas que un
 * número habría cazado —la cámara encima de las piezas, el tablero fuera de cuadro— y que
 * solo se descubrieron cuando el propietario mandó una captura. Con las posiciones aquí,
 * "¿cabe el tablero en pantalla?" es un test, no una recarga.
 */

/** Dónde está la cámara y a dónde mira, en unidades de casilla. */
export type Plano = {
  posicion: [number, number, number];
  objetivo: [number, number, number];
};

/** El campo de visión de la cámara, en grados. Una lente normal, sin deformar. */
export const CAMPO_VISION = 40;

/** El tablero mide ocho casillas de lado y está centrado en el origen. */
export const LADO_TABLERO = 8;

/**
 * ACTO 1 — arranque: pegado a la mesa y por debajo, casi a ras.
 *
 * Aquí NO se ve el tablero entero a propósito: es el plano cerrado del que la cámara se
 * va a alejar, y si ya se viera todo no habría nada que revelar.
 */
export const PLANO_INICIAL: Plano = {
  posicion: [0.4, 0.85, 3.6],
  objetivo: [0, 0.35, 0],
};

/**
 * ACTO 2 — la cámara ha retrocedido: el tablero entero en cuadro, en escorzo.
 *
 * Es el plano en el que caen las piezas, así que tiene que caber todo con margen.
 */
export const PLANO_MEDIO: Plano = {
  posicion: [0, 5.2, 11.5],
  objetivo: [0, 0.3, 0],
};

/**
 * ACTO 3 — vista alta que LLENA la cabecera, porque el tablero es el fondo.
 *
 * NO ES CENITAL PURO, y no por gusto: desde justo encima, para cubrir el ancho de una
 * cabecera apaisada habría que acercarse tanto que solo se verían las filas centrales —
 * que son precisamente las vacías. Inclinando la cámara, el tablero desborda el cuadro
 * por arriba y por abajo (que es lo que se quiere de un fondo) y además las piezas se
 * ven de perfil en vez de como círculos.
 *
 * Aquí el tablero NO cabe entero a propósito: eso es lo que lo convierte en fondo y no
 * en un objeto flotando con márgenes oscuros alrededor.
 */
export const PLANO_FINAL: Plano = {
  // MÁS ALTO QUE LEJOS, y la proporción importa: subir la cámara sin alejarla hace la
  // vista más picada, y eso sube el borde CERCANO dentro del cuadro. Con el ángulo
  // anterior, la primera fila de piezas quedaba cortada por el borde de abajo — el
  // tablero llenaba la cabecera, sí, pero partiendo las piezas por la mitad. Ahora lo
  // que se sale de cuadro es el fondo del tablero, que es madera y no molesta.
  posicion: [0, 9, 5.4],
  objetivo: [0, 0.2, 0],
};

/** Nombre viejo, por si algo lo sigue importando. */
export const PLANO_CENITAL = PLANO_FINAL;

/** Desde qué altura caen las piezas. Alto para que la caída se vea, no tanto como para
 *  que salgan de cuadro en el plano medio. */
export const ALTURA_CAIDA = 7;

/**
 * Cuánto tarda cada pieza en empezar a caer, en segundos.
 *
 * DE FUERA HACIA DENTRO Y DE ATRÁS HACIA DELANTE: caen antes las de las esquinas del
 * fondo y por último las de delante, que son las que quedan más cerca de la cámara. Así
 * la última que aterriza es la que mejor se ve, que es como se remata un plano.
 *
 * `fila` va de 1 a 8 y `columna` de 0 a 7.
 */
export function retrasoDeCaida(columna: number, fila: number): number {
  // Las filas 8 y 7 (negras) primero; luego la 2 y la 1 (blancas).
  const ordenFila = fila >= 7 ? 8 - fila : 2 + (2 - fila) + 1;
  // Dentro de la fila, de los bordes al centro.
  const desdeElBorde = Math.min(columna, 7 - columna);
  return ordenFila * 0.34 + desdeElBorde * 0.09;
}

/**
 * ¿Cabe el tablero entero en pantalla desde este plano?
 *
 * La comprobación que habría ahorrado dos iteraciones: con el campo de visión y la
 * distancia se sabe cuánto se ve, y si el tablero no cabe, no cabe — no hace falta
 * desplegar para descubrirlo.
 */
export function cabeElTablero(plano: Plano, campoVision = CAMPO_VISION): boolean {
  const [x, y, z] = plano.posicion;
  const [ox, oy, oz] = plano.objetivo;
  const distancia = Math.hypot(x - ox, y - oy, z - oz);
  const mitadAngulo = ((campoVision / 2) * Math.PI) / 180;
  const alturaVisible = 2 * distancia * Math.tan(mitadAngulo);
  return alturaVisible >= LADO_TABLERO;
}

/**
 * La curva con la que cae una pieza, y las que NO valen.
 *
 * ESTÁ AQUÍ Y CON TEST porque es un error fácil de reintroducir y difícil de ver: las
 * curvas de la familia `back` y `bounce` REBASAN el valor final y vuelven. Como el valor
 * final de una caída es la superficie del tablero, rebasarlo significa que la pieza se
 * mete DENTRO de la madera y sale luego. Se probó con las dos y las dos hicieron lo
 * mismo; el propietario lo describió como "se comen un poco el tablero y luego se ponen
 * bien", que es exactamente eso.
 *
 * Solo valen curvas que se acercan al destino sin pasarse.
 */
export const EASE_CAIDA = "power3.out";

/** Familias de curva que rebasan el destino: prohibidas para algo que aterriza. */
export const EASES_QUE_SE_PASAN = ["back", "bounce", "elastic"] as const;

/** ¿Esta curva se pasa del destino? */
export function sePasaDelDestino(ease: string): boolean {
  return EASES_QUE_SE_PASAN.some((f) => ease.startsWith(f));
}
