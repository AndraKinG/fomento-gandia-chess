/**
 * Proyección 2.5D de un tablero: de casilla a "dónde y de qué tamaño se pinta".
 *
 * POR QUÉ A MANO Y NO CON `rotateX` ANIDADO. La primera versión del hero inclinaba el
 * tablero con `rotateX` y contrarrestaba cada pieza con la rotación opuesta dentro de un
 * `preserve-3d`. Sobre el papel es la técnica correcta —y en la sección de la partida
 * funciona— pero en el hero salió al revés cuatro veces seguidas: midiendo las piezas en
 * pantalla, la fila 8 (la del FONDO) llegó a medir 132 px contra 11 px de la primera. El
 * navegador compone las transformaciones anidadas con el punto de fuga de una forma que
 * no se puede predecir a ojo, y depurar eso a base de recargar es tirar el tiempo.
 *
 * Con la proyección hecha aquí, la profundidad es una cuenta que se puede LEER y PROBAR:
 * la fila 1 sale grande y abajo, la 8 pequeña y arriba, y punto.
 *
 * NO ES UNA PROYECCIÓN 3D DE VERDAD, y no hace falta: basta con que las tres pistas que
 * usa el ojo para juzgar distancia sean coherentes entre sí —tamaño, separación y
 * altura en pantalla—. Eso es lo que hacían los juegos isométricos antes de que hubiera
 * tarjetas 3D, y sigue funcionando igual de bien.
 */

/** Lo que hace falta para pintar una pieza en la escena. */
export type PuntoEscena = {
  /** Porcentaje horizontal desde el borde izquierdo del lienzo. */
  x: number;
  /** Porcentaje vertical desde arriba. */
  y: number;
  /** Escala relativa: 1 en la fila más cercana. */
  escala: number;
};

/**
 * Cuánto se "cierra" el tablero hacia el horizonte.
 *
 * 0 sería un tablero visto de frente (sin perspectiva) y 1 lo llevaría al punto de fuga.
 * 0,62 es una mesa vista desde una silla: se ve el fondo pero todavía se distinguen las
 * piezas de atrás.
 */
const FUGA = 0.62;

/**
 * Dónde cae una casilla en el lienzo.
 *
 * `fila` va de 1 (la más cercana, abajo) a 8 (la del fondo), y `columna` de 0 a 7.
 */
export function proyectar(columna: number, fila: number): PuntoEscena {
  // Profundidad normalizada: 0 la fila de delante, 1 la del fondo.
  const z = (fila - 1) / 7;

  // El tamaño cae con la distancia. No en línea recta: en perspectiva de verdad el
  // tamaño va como 1/(1+kz), y esa curva es la que hace que las primeras filas se
  // separen mucho y las últimas se apelotonen, que es justo lo que lee el ojo como
  // profundidad.
  const escala = 1 / (1 + FUGA * z * 1.9);

  // Las filas se juntan hacia el fondo con la misma curva: si se repartieran a
  // distancias iguales, el tablero parecería un mantel de cuadros, no una mesa.
  const avance = (1 - 1 / (1 + FUGA * z * 1.9)) / (1 - 1 / (1 + FUGA * 1.9));

  return {
    // Las columnas se estrechan hacia el fondo alrededor del centro.
    x: 50 + (columna - 3.5) * 11 * escala,
    // De abajo (fila 1) hacia arriba (fila 8).
    y: 88 - avance * 62,
    escala,
  };
}
