/**
 * ELO interno del club.
 *
 * Módulo puro: sin base de datos ni red. Calcula lo que le pasa al ELO de dos
 * jugadores tras una partida, siguiendo la fórmula de Elo estándar.
 *
 * Se calcula SOLO con las partidas de los torneos internos, como decidió la spec
 * original. Mezclar aquí las partidas del repositorio (que cada uno sube de donde
 * quiera, sin control de quién era el rival ni de si la partida existió) haría el
 * ranking del club indefendible.
 */

export type Resultado = "1" | "0.5" | "0";

/**
 * ELO de partida para quien no tiene ninguno todavía.
 *
 * Solo se usa como último recurso: lo normal es **arrancar del ELO oficial**
 * (FACV/FIDE/FEDA) con `eloInicial`, porque en un club la fuerza de cada uno ya
 * se conoce y empezar a todos en 1500 daría un ranking absurdo durante meses
 * mientras converge.
 */
export const ELO_POR_DEFECTO = 1500;

/**
 * Factor K: cuánto se mueve el ELO por partida.
 *
 * Se usa el criterio clásico de "provisional" y "asentado": los primeros
 * encuentros mueven mucho para llegar rápido al nivel real, y luego se calma
 * para que el ranking no dé bandazos. Los valores son los de la FIDE para
 * aficionados (40/20), sin el tramo de 10 para maestros: no aplica aquí.
 */
export const K_PROVISIONAL = 40;
export const K_ASENTADO = 20;
export const PARTIDAS_PROVISIONALES = 15;

export function factorK(partidasJugadas: number): number {
  return partidasJugadas < PARTIDAS_PROVISIONALES ? K_PROVISIONAL : K_ASENTADO;
}

/**
 * ELO de partida de un jugador: el oficial si se conoce, y si no el de por
 * defecto. `max` entre las federaciones por el mismo criterio que ya usa el
 * validador para la fuerza (RGC art. 52.1).
 */
export function eloInicial(oficiales: {
  eloFacv?: number | null;
  eloFide?: number | null;
  eloFeda?: number | null;
}): number {
  const candidatos = [oficiales.eloFacv, oficiales.eloFide, oficiales.eloFeda].filter(
    (e): e is number => typeof e === "number" && e > 0
  );
  return candidatos.length > 0 ? Math.max(...candidatos) : ELO_POR_DEFECTO;
}

/**
 * Puntuación esperada de A contra B según la diferencia de ELO. Entre 0 y 1.
 *
 * Es la curva logística de Elo: 400 puntos de diferencia ≈ 0.91 esperado para el
 * favorito.
 */
export function esperado(eloA: number, eloB: number): number {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

function puntos(resultado: Resultado): number {
  return resultado === "1" ? 1 : resultado === "0.5" ? 0.5 : 0;
}

export type CambioElo = {
  antes: number;
  despues: number;
  delta: number;
  esperado: number;
};

/**
 * Nuevo ELO de un jugador tras una partida.
 *
 * El delta se redondea al entero más cercano (`Math.round`), no se trunca: con
 * truncado, los cambios pequeños de los jugadores muy parejos se irían siempre a
 * cero y el ELO se quedaría congelado entre iguales.
 */
export function nuevoElo(
  elo: number,
  eloRival: number,
  resultado: Resultado,
  partidasJugadas: number
): CambioElo {
  const e = esperado(elo, eloRival);
  const k = factorK(partidasJugadas);
  const delta = Math.round(k * (puntos(resultado) - e));
  return { antes: elo, despues: elo + delta, delta, esperado: e };
}

/** El resultado visto desde el otro lado del tablero. */
export function resultadoInverso(resultado: Resultado): Resultado {
  return resultado === "1" ? "0" : resultado === "0" ? "1" : "0.5";
}

export type PartidaElo = {
  /** Ficha del jugador de blancas. */
  blancas: string;
  negras: string;
  /** Desde el punto de vista de las BLANCAS. */
  resultado: Resultado;
};

export type EstadoElo = { elo: number; partidas: number };

/**
 * Recalcula el ELO de todos a partir de la lista completa de partidas, en orden.
 *
 * Se recalcula desde cero en vez de ir acumulando sobre el valor guardado, y es a
 * propósito: si se corrige el resultado de una partida de la ronda 2, todo lo que
 * viene después cambia. Acumulando, esa corrección dejaría el ranking mal para
 * siempre; recalculando, basta volver a pasar la lista.
 *
 * El orden de la lista importa: es el orden en que se jugaron.
 */
export function recalcular(
  partidas: PartidaElo[],
  inicial: Record<string, number>
): Record<string, EstadoElo> {
  const estado: Record<string, EstadoElo> = {};
  const dameEstado = (ficha: string): EstadoElo => {
    if (!estado[ficha]) {
      estado[ficha] = { elo: inicial[ficha] ?? ELO_POR_DEFECTO, partidas: 0 };
    }
    return estado[ficha];
  };

  for (const p of partidas) {
    const b = dameEstado(p.blancas);
    const n = dameEstado(p.negras);

    // Los dos cambios se calculan con los ELO de ANTES de la partida: si se
    // aplicara el de blancas primero, las negras jugarían contra un rival que ya
    // ha cambiado y el resultado dependería del orden en que se procesan.
    const cambioB = nuevoElo(b.elo, n.elo, p.resultado, b.partidas);
    const cambioN = nuevoElo(n.elo, b.elo, resultadoInverso(p.resultado), n.partidas);

    b.elo = cambioB.despues;
    b.partidas += 1;
    n.elo = cambioN.despues;
    n.partidas += 1;
  }

  return estado;
}
