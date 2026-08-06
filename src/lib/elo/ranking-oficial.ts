/**
 * Ordenación y estadísticas del ranking oficial del club.
 *
 * EN MÓDULO APARTE porque es donde está el detalle que no se ve mirando la
 * pantalla: `force_order.elo_oficial` es NULLABLE (se añadió en la migración 0004
 * sin `not null`), y un `null` metido en una resta da `NaN`. Un comparador que
 * devuelve `NaN` deja la lista en un orden cualquiera, sin fallar y sin avisar, así
 * que el que no tenga ELO se manda al final a propósito.
 */

export type JugadorRanking = {
  numero: number;
  bisIndex: number;
  nombre: string;
  eloOficial: number | null;
};

/**
 * De mayor a menor ELO oficial; sin ELO al final; empates por nombre.
 *
 * No modifica la lista que recibe: la pantalla necesita conservar el orden de
 * fuerza original para la otra pestaña.
 */
export function ordenarPorElo<T extends JugadorRanking>(jugadores: readonly T[]): T[] {
  return [...jugadores].sort(
    (a, b) =>
      (b.eloOficial ?? -1) - (a.eloOficial ?? -1) || a.nombre.localeCompare(b.nombre)
  );
}

export type EstadisticasClub = {
  jugadores: number;
  /** null si nadie tiene ELO: mejor un guion en la pantalla que un 0 que parece dato. */
  media: number | null;
  maximo: number | null;
};

export function estadisticasClub(
  jugadores: readonly JugadorRanking[]
): EstadisticasClub {
  // Se descarta el 0 además del null: en la base un ELO a 0 significa "no tiene",
  // y colarlo en la media la hundiría.
  const elos = jugadores
    .map((j) => j.eloOficial)
    .filter((e): e is number => typeof e === "number" && e > 0);
  if (elos.length === 0) {
    return { jugadores: jugadores.length, media: null, maximo: null };
  }
  return {
    jugadores: jugadores.length,
    media: Math.round(elos.reduce((a, b) => a + b, 0) / elos.length),
    maximo: Math.max(...elos),
  };
}

/** Etiqueta del número de orden de fuerza: "12" o "12bis". */
export function etiquetaNumero(numero: number, bisIndex: number): string {
  return `${numero}${bisIndex ? "bis" : ""}`;
}
