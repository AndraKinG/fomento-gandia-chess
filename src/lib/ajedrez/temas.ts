/**
 * Los temas del tablero: las parejas de colores entre las que puede elegir cada
 * socio desde su perfil.
 *
 * OPCIONES PREDEFINIDAS POR NOSOTROS, no un selector de color libre (decisión del
 * propietario): un tablero necesita contraste entre casillas Y entre casillas y
 * piezas, y un color elegido a mano puede dejar los peones blancos invisibles.
 * Cuatro opciones probadas cubren los gustos de siempre sin abrir esa puerta.
 *
 * LOS COLORES VAN EN DURO, no en tokens del tema claro/oscuro: un tablero es el
 * mismo de día y de noche — heredar los tokens lo haría ilegible en modo oscuro.
 * (Es la misma decisión que ya estaba tomada cuando solo había un tema.)
 *
 * La elección se guarda en `profiles.tema_tablero` (migración 0030) y viaja con la
 * cuenta: el mismo tablero en el móvil y en el ordenador.
 */

export type TemaTablero = {
  /** Clave que se guarda en la base. No cambiarla: rompería lo ya elegido. */
  clave: string;
  /** Nombre que se enseña en el selector. */
  nombre: string;
  /** Casilla clara. */
  clara: string;
  /** Casilla oscura, que es también el color de las coordenadas sobre clara. */
  oscura: string;
};

export const TEMAS_TABLERO: readonly TemaTablero[] = [
  // El de siempre: el blanquiazul del club. Primero porque es el default.
  { clave: "gandiblues", nombre: "Gandiblues", clara: "#e9f2fb", oscura: "#6b9dc9" },
  { clave: "verde", nombre: "Verde torneo", clara: "#ebecd0", oscura: "#739552" },
  { clave: "madera", nombre: "Madera", clara: "#f0d9b5", oscura: "#b58863" },
  { clave: "gris", nombre: "Piedra", clara: "#dee3e6", oscura: "#8ca2ad" },
];

export const TEMA_POR_DEFECTO = TEMAS_TABLERO[0];

/**
 * El tema de una clave guardada, con red: si la clave no existe (dato viejo, o
 * escrito a mano), se vuelve al del club en vez de dejar el tablero sin colores.
 */
export function temaTablero(clave: string | null | undefined): TemaTablero {
  return TEMAS_TABLERO.find((t) => t.clave === clave) ?? TEMA_POR_DEFECTO;
}

/** ¿Es una clave que se puede guardar? Lo comprueba la acción antes de escribir. */
export function esTemaValido(clave: string): boolean {
  return TEMAS_TABLERO.some((t) => t.clave === clave);
}
