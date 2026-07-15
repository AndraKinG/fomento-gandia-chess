// Módulo PURO (sin I/O): el color de las piezas NUNCA se almacena en BD (ver
// comentario en supabase/migrations/0005_convocatorias.sql, lineup_boards) —
// se calcula siempre al leer, a partir del tablero y de si el equipo juega
// como local esa jornada.

/**
 * Color de las piezas del jugador de ESTE equipo en `tablero` (RGC art. 59):
 * en cada tablero, el jugador LOCAL juega blancas si el número de tablero es
 * impar (y negras si es par); el visitante lleva siempre el color contrario
 * al que le correspondería al local en ese mismo tablero.
 */
export function colorDeTablero(tablero: number, esLocal: boolean): "blancas" | "negras" {
  const blancasParaElLocal = tablero % 2 === 1;
  return blancasParaElLocal === esLocal ? "blancas" : "negras";
}
