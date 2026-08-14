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
 * ACTO 3 — vista alta con el tablero ENTERO en cuadro.
 *
 * AQUÍ HUBO UN TIRA Y AFLOJA QUE CONVIENE DEJAR ESCRITO, porque son dos deseos que no
 * caben juntos: "que el tablero sea el fondo de la cabecera" pide que desborde hasta los
 * bordes, y "que no se corte abajo" pide que quepa entero. Es lo uno o lo otro.
 *
 * Gana VERLO ENTERO, que es lo que pidió el propietario después de ver las dos: un
 * tablero cortado parte por la mitad la primera fila de piezas, y una fila de piezas
 * serradas se ve como un fallo. Un margen oscuro alrededor, en cambio, se lee como la
 * mesa sobre la que está el tablero — que es lo que es.
 *
 * NO ES CENITAL PURO: desde justo encima las piezas son círculos y no se distingue
 * ninguna. En escorzo se ven de perfil.
 */
export const PLANO_FINAL: Plano = {
  posicion: [0, 10.6, 7.2],
  objetivo: [0, 0, 0],
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

/* ---------------------------------------------------------------------------
 * ENCUADRE DE VERDAD
 *
 * `cabeElTablero` de arriba está MAL para lo que se usaba, y costó tres vueltas
 * descubrirlo: mide el alto visible a la distancia del CENTRO del tablero y lo compara
 * con su tamaño. Pero un tablero visto en escorzo no está a una sola distancia — su
 * borde cercano está mucho más próximo a la cámara y por eso se proyecta más abajo y más
 * grande, saliéndose del cuadro. Los tests decían "cabe" y en pantalla se cortaba la
 * primera fila.
 *
 * Lo de aquí abajo proyecta LAS CUATRO ESQUINAS de verdad y calcula la distancia a la
 * que hay que poner la cámara, en vez de probar números a ojo.
 * ------------------------------------------------------------------------ */

type Vec3 = [number, number, number];

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const escalar = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const punto = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const largo = (a: Vec3): number => Math.sqrt(punto(a, a));
const normal = (a: Vec3): Vec3 => escalar(a, 1 / (largo(a) || 1));

/** El tablero con su marco, un pelo más para dejar aire. */
const MEDIO_LADO = 4.75;

/** Las cuatro esquinas del tablero, a ras de suelo. */
export const ESQUINAS: Vec3[] = [
  [-MEDIO_LADO, 0, -MEDIO_LADO],
  [MEDIO_LADO, 0, -MEDIO_LADO],
  [-MEDIO_LADO, 0, MEDIO_LADO],
  [MEDIO_LADO, 0, MEDIO_LADO],
];

/**
 * Cuánto se sale del cuadro el punto que peor esté, en tanto por uno.
 *
 * 1 es justo el borde; por encima de 1, fuera. Se mira el alto y el ancho por separado,
 * porque en una pantalla apaisada aprieta el alto y en un móvil vertical el ancho.
 */
export function desbordeMaximo(
  plano: Plano,
  aspecto: number,
  campoVision = CAMPO_VISION,
  /**
   * Solo mirar el alto.
   *
   * ES LA REGLA BUENA para el hero, y sale de las dos quejas juntas: "el tablero debe ser
   * el fondo de la cabecera" y "se corta abajo". Ajustando SOLO en vertical, los bordes
   * cercano y lejano —donde están las piezas— siempre entran, y lo que se sale es por los
   * lados, que es tablero vacío y se lee como que la mesa sigue más allá del cuadro.
   *
   * Ajustar también el ancho obligaba a alejarse tanto en un móvil vertical (30 unidades
   * contra 14) que el tablero quedaba diminuto con medio hueco negro arriba y abajo.
   */
  soloVertical = false
): number {
  const cam = plano.posicion as Vec3;
  const adelante = normal(resta(plano.objetivo as Vec3, cam));
  const derecha = normal(cruz(adelante, [0, 1, 0]));
  const arriba = cruz(derecha, adelante);
  const tanV = Math.tan(((campoVision / 2) * Math.PI) / 180);
  const tanH = tanV * aspecto;

  let peor = 0;
  for (const e of ESQUINAS) {
    const v = resta(e, cam);
    const fondo = punto(v, adelante);
    if (fondo <= 0.001) return Infinity; // detrás de la cámara
    peor = Math.max(peor, Math.abs(punto(v, arriba)) / (fondo * tanV));
    if (!soloVertical) peor = Math.max(peor, Math.abs(punto(v, derecha)) / (fondo * tanH));
  }
  return peor;
}

/**
 * La cámara, colocada a la distancia JUSTA para que el tablero entre entero.
 *
 * Conserva la DIRECCIÓN del plano que se le pase —el ángulo picado es una decisión de
 * encuadre— y solo ajusta cuánto se aleja. Búsqueda binaria en vez de fórmula: la
 * proyección de un plano en escorzo no se despeja en una línea, y veinte iteraciones de
 * esto son microsegundos.
 *
 * `margen` deja aire alrededor: 0,92 significa que el tablero ocupa el 92% del cuadro.
 */
export function planoQueEncuadra(
  base: Plano,
  aspecto: number,
  margen = 0.92,
  campoVision = CAMPO_VISION,
  soloVertical = false
): Plano {
  const objetivo = base.objetivo as Vec3;
  const direccion = normal(resta(base.posicion as Vec3, objetivo));

  let cerca = 1;
  let lejos = 200;
  for (let i = 0; i < 40; i++) {
    const medio = (cerca + lejos) / 2;
    const prueba: Plano = {
      posicion: suma(objetivo, escalar(direccion, medio)) as [number, number, number],
      objetivo: base.objetivo,
    };
    if (desbordeMaximo(prueba, aspecto, campoVision, soloVertical) > margen) cerca = medio;
    else lejos = medio;
  }
  return {
    posicion: suma(objetivo, escalar(direccion, lejos)) as [number, number, number],
    objetivo: base.objetivo,
  };
}
