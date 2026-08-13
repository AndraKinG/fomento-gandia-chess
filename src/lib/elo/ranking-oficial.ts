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
  /** FIDE de clásicas al día, que lo trae la sync del ranking de la FACV. */
  eloFide?: number | null;
};

/**
 * El ELO con el que se ordena: el REAL de cada uno.
 *
 * ES EL FIDE DE CLÁSICAS, no el del orden de fuerza, y esto era un fallo (visto por el
 * propietario el 2026-08-13: "cuando filtras por elo, ¿no debería coger el FIDE para
 * hacer el orden?"). Su propia regla de los tres ELOs dice que el del orden de fuerza
 * es ESTÁTICO todo el año y solo vale para el Interclubs; ordenar por él daba la foto
 * de septiembre en marzo. Cuando se escribió esto ninguna ficha tenía ELO FIDE, así
 * que era el único que había — dejó de ser verdad al montar la sync del ranking FACV.
 *
 * El del orden de fuerza queda de respaldo para quien no tiene FIDE (11 de 46): mejor
 * un número viejo que mandarlo al final de la lista como si no jugara.
 */
export function eloParaOrdenar(j: JugadorRanking): number | null {
  return j.eloFide ?? j.eloOficial ?? null;
}

/**
 * De mayor a menor ELO real; sin ELO al final; empates por nombre.
 *
 * No modifica la lista que recibe: la pantalla necesita conservar el orden de
 * fuerza original para la otra pestaña.
 */
export function ordenarPorElo<T extends JugadorRanking>(jugadores: readonly T[]): T[] {
  return [...jugadores].sort(
    (a, b) =>
      (eloParaOrdenar(b) ?? -1) - (eloParaOrdenar(a) ?? -1) ||
      a.nombre.localeCompare(b.nombre)
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
  // Con el ELO REAL de cada uno, por el mismo motivo que la ordenación: la media del
  // club de este mes no se calcula con la foto de septiembre.
  //
  // Se descarta el 0 además del null: en la base un ELO a 0 significa "no tiene",
  // y colarlo en la media la hundiría.
  const elos = jugadores
    .map((j) => eloParaOrdenar(j))
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
