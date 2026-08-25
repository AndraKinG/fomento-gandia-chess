/**
 * Deja un PGN anotado en algo que `chess.js` sepa leer, SIN tocar el guardado.
 *
 * EL FALLO QUE ARREGLA, medido contra `chess.js` 1.4.0: su lector **solo acepta UN
 * comentario por jugada** y no acepta ninguno DESPUÉS de una variante. Y Lichess exporta
 * justo eso —dos comentarios seguidos por jugada, la evaluación y el texto—:
 *
 *     7. Ne5?! { [%eval 0.0] } { Inaccuracy. Bxd6 was best. } (7. Bxd6 Qxd6 ...)
 *
 * Con eso, `loadPgn` lanza "Expected ... but "{" found" y la partida entera se queda sin
 * reproducir: pasó con un capítulo de estudio del propietario, guardado y visible en
 * texto pero imposible de pasar jugada a jugada. Un PGN que Lichess escribe es un PGN
 * válido; el que se queda corto es el lector.
 *
 * QUÉ SE HACE, y en este orden:
 *
 * 1. **Fuera las variantes** (los paréntesis, anidados incluidos). El visor reproduce
 *    UNA línea; una variante es otra partida y no cabe en una tira de posiciones.
 * 2. **Los comentarios seguidos se JUNTAN en uno**, no se tiran: ahí está lo que dice
 *    el análisis ("Mistake. Qc7 was best."), que es justo lo que uno quiere leer al
 *    repasar. Uniéndolos se cumple la regla del lector sin perder una palabra.
 *
 * NO SE TOCA LO QUE SE GUARDA EN LA BASE. El PGN del socio se queda tal cual lo pegó,
 * porque es suyo y porque al exportarlo tiene que salir completo, con variantes y todo.
 * Esto es una capa de lectura y nada más.
 *
 * MÓDULO PURO Y CON TESTS SOBRE EL PGN REAL que lo destapó.
 */

/**
 * Quita las variantes entre paréntesis, incluidas las anidadas.
 *
 * SE HACE A MANO Y NO CON UNA EXPRESIÓN REGULAR porque los paréntesis anidados no se
 * pueden emparejar con una: `\(...\)` deja las de dentro sueltas y la línea principal
 * acaba con jugadas de una variante metidas en medio, que es peor que no leerla.
 *
 * Los paréntesis DENTRO de un comentario no cuentan: en un texto de análisis puede
 * haber un "(mejor)" que no abre ninguna variante.
 */
export function sinVariantes(movetext: string): string {
  let salida = "";
  let profundidad = 0;
  let enComentario = false;
  for (const ch of movetext) {
    if (enComentario) {
      if (ch === "}") enComentario = false;
      if (profundidad === 0) salida += ch;
      continue;
    }
    if (ch === "{") {
      enComentario = true;
      if (profundidad === 0) salida += ch;
      continue;
    }
    if (ch === "(") {
      profundidad++;
      continue;
    }
    if (ch === ")") {
      if (profundidad > 0) profundidad--;
      continue;
    }
    if (profundidad === 0) salida += ch;
  }
  return salida;
}

/** Dos o más comentarios seguidos, en uno solo. */
export function comentariosJuntos(movetext: string): string {
  // `{a} {b}` → `{a b}`, repetido mientras queden pares: con tres seguidos hace falta
  // pasar dos veces.
  let antes: string;
  let x = movetext;
  do {
    antes = x;
    x = x.replace(/\{([^{}]*)\}(\s*)\{([^{}]*)\}/g, (_, a, __, b) => {
      const texto = `${String(a).trim()} ${String(b).trim()}`.trim();
      return `{ ${texto} }`;
    });
  } while (x !== antes);
  return x;
}

/**
 * El PGN listo para reproducir.
 *
 * Las cabeceras se dejan intactas: `chess.js` las lee bien y de ellas salen el evento y
 * la fecha. Solo se limpia el cuerpo de jugadas.
 */
export function paraReproducir(pgn: string): string {
  const texto = pgn.replace(/\r\n?/g, "\n");
  // El cuerpo empieza tras la última cabecera; si no hay ninguna, es todo cuerpo.
  const cabeceras = [...texto.matchAll(/^\s*\[\s*\w+\s+"[^"]*"\s*\]\s*$/gm)];
  const corte = cabeceras.length > 0 ? (cabeceras.at(-1)!.index ?? 0) + cabeceras.at(-1)![0].length : 0;
  const cabecera = texto.slice(0, corte);
  const cuerpo = texto.slice(corte);
  return cabecera + comentariosJuntos(sinVariantes(cuerpo));
}
