/**
 * Clasificación de un torneo interno.
 *
 * Módulo puro. Calcula puntos y desempates a partir de los emparejamientos con
 * resultado, y deja la tabla ordenada.
 */

export type Resultado = "1" | "0.5" | "0";

export type EmparejamientoJugado = {
  blancas: string;
  negras: string;
  /** null si la partida aún no se ha jugado. */
  resultado: Resultado | null;
};

export type RondaJugada = {
  numero: number;
  emparejamientos: EmparejamientoJugado[];
  /** Quien descansó esa ronda, si hubo impares. */
  descansa: string | null;
};

export type FilaClasificacion = {
  ficha: string;
  puntos: number;
  /** Partidas con resultado. Los descansos no cuentan como jugadas. */
  jugadas: number;
  victorias: number;
  tablas: number;
  derrotas: number;
  /** Descansos, que puntúan pero no son partidas. */
  descansos: number;
  /** Suma de los puntos de los rivales: el desempate clásico del suizo. */
  buchholz: number;
  eloInicial: number;
};

/**
 * Un descanso puntúa como victoria.
 *
 * Es la costumbre en los torneos suizos: quien se queda sin rival por ser impares
 * no debe salir perjudicado en la clasificación. No cuenta como partida jugada,
 * así que tampoco mueve su ELO ni su porcentaje.
 */
export const PUNTOS_POR_DESCANSO = 1;

function puntosDe(resultado: Resultado): number {
  return resultado === "1" ? 1 : resultado === "0.5" ? 0.5 : 0;
}

/**
 * Tabla de clasificación ordenada.
 *
 * Orden: **puntos**, luego **Buchholz** (la suma de los puntos de tus rivales,
 * que premia haber tenido un calendario más duro), luego **victorias** (a igual
 * puntuación, gana quien arriesgó más en vez de firmar tablas), y por último el
 * ELO de partida, para que el orden sea determinista y no dependa de cómo llegó
 * la lista.
 *
 * El Buchholz se calcula al final, cuando ya se conocen los puntos de todos: por
 * eso hacen falta dos pasadas y no se puede acumular sobre la marcha.
 */
export function clasificar(
  rondas: RondaJugada[],
  inscritos: { ficha: string; eloInicial: number }[]
): FilaClasificacion[] {
  const filas = new Map<string, FilaClasificacion>(
    inscritos.map((i) => [
      i.ficha,
      {
        ficha: i.ficha,
        puntos: 0,
        jugadas: 0,
        victorias: 0,
        tablas: 0,
        derrotas: 0,
        descansos: 0,
        buchholz: 0,
        eloInicial: i.eloInicial,
      },
    ])
  );
  // Rivales de cada uno, para el Buchholz.
  const rivales = new Map<string, string[]>(inscritos.map((i) => [i.ficha, []]));

  const anota = (
    ficha: string,
    resultado: Resultado,
    rival: string
  ): void => {
    const fila = filas.get(ficha);
    if (!fila) return; // alguien que jugó pero no está inscrito: se ignora
    fila.puntos += puntosDe(resultado);
    fila.jugadas += 1;
    if (resultado === "1") fila.victorias += 1;
    else if (resultado === "0.5") fila.tablas += 1;
    else fila.derrotas += 1;
    rivales.get(ficha)?.push(rival);
  };

  for (const ronda of rondas) {
    for (const e of ronda.emparejamientos) {
      if (e.resultado === null) continue;
      anota(e.blancas, e.resultado, e.negras);
      anota(
        e.negras,
        e.resultado === "1" ? "0" : e.resultado === "0" ? "1" : "0.5",
        e.blancas
      );
    }
    if (ronda.descansa) {
      const fila = filas.get(ronda.descansa);
      if (fila) {
        fila.puntos += PUNTOS_POR_DESCANSO;
        fila.descansos += 1;
      }
    }
  }

  // Segunda pasada: el Buchholz necesita los puntos finales de los rivales.
  for (const fila of filas.values()) {
    fila.buchholz = (rivales.get(fila.ficha) ?? []).reduce(
      (suma, r) => suma + (filas.get(r)?.puntos ?? 0),
      0
    );
  }

  return [...filas.values()].sort(
    (a, b) =>
      b.puntos - a.puntos ||
      b.buchholz - a.buchholz ||
      b.victorias - a.victorias ||
      b.eloInicial - a.eloInicial ||
      a.ficha.localeCompare(b.ficha)
  );
}

/** ¿Están todas las partidas de la ronda con resultado? */
export function rondaCompleta(ronda: RondaJugada): boolean {
  return ronda.emparejamientos.every((e) => e.resultado !== null);
}

/**
 * Estado de cada jugador para emparejar la ronda siguiente, tal como lo espera
 * `emparejarSuizo`.
 *
 * Junta lo que hace falta saber de las rondas ya jugadas: puntos, contra quién ha
 * jugado, qué colores ha llevado y si ya descansó.
 */
export function estadoParaEmparejar(
  rondas: RondaJugada[],
  inscritos: { ficha: string; eloInicial: number }[]
): {
  ficha: string;
  puntos: number;
  elo: number;
  rivales: string[];
  colores: ("blancas" | "negras")[];
  haDescansado: boolean;
}[] {
  const tabla = clasificar(rondas, inscritos);
  const porFicha = new Map(tabla.map((f) => [f.ficha, f]));

  return inscritos.map((i) => {
    const rivales: string[] = [];
    const colores: ("blancas" | "negras")[] = [];
    let haDescansado = false;

    for (const ronda of rondas) {
      if (ronda.descansa === i.ficha) haDescansado = true;
      for (const e of ronda.emparejamientos) {
        if (e.blancas === i.ficha) {
          rivales.push(e.negras);
          colores.push("blancas");
        } else if (e.negras === i.ficha) {
          rivales.push(e.blancas);
          colores.push("negras");
        }
      }
    }

    return {
      ficha: i.ficha,
      // Los puntos de la clasificación, que ya cuentan los descansos.
      puntos: porFicha.get(i.ficha)?.puntos ?? 0,
      elo: i.eloInicial,
      rivales,
      colores,
      haDescansado,
    };
  });
}
