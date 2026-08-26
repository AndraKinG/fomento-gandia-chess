/**
 * Emparejamientos de los torneos internos del club.
 *
 * Módulo puro: sin base de datos ni red. Dos sistemas:
 *
 * - **Round-robin** (liguilla): todos contra todos, con el método del círculo.
 *   Determinista y sin sorpresas; sirve para grupos pequeños.
 * - **Suizo**: para grupos grandes, donde una liguilla completa no cabe en las
 *   rondas disponibles.
 *
 * El suizo de aquí es un suizo de club, no el sistema holandés completo de la
 * FIDE: empareja por grupos de puntuación, no repite enfrentamientos y equilibra
 * los colores. No implementa los criterios de desempate ni el flotante
 * descendente/ascendente reglado. Para un torneo interno es lo que hace falta; si
 * algún día se quisiera homologar el torneo, haría falta el sistema completo.
 */

export type Color = "blancas" | "negras";

export type Emparejamiento = {
  blancas: string;
  negras: string;
};

export type Ronda = {
  numero: number;
  emparejamientos: Emparejamiento[];
  /** Ficha que descansa esta ronda, si el número de jugadores es impar. */
  descansa: string | null;
};

// ---------------------------------------------------------------------------
// Round-robin
// ---------------------------------------------------------------------------

/**
 * Calendario completo de todos contra todos por el método del círculo.
 *
 * Con N jugadores salen N−1 rondas si N es par, y N rondas si es impar (en cada
 * una descansa uno). Se alternan los colores por ronda para que nadie lleve
 * blancas siempre.
 */
export function calendarioLiguilla(fichas: string[]): Ronda[] {
  // Menos de dos jugadores no es un torneo. Se comprueba ANTES de meter el hueco
  // de los impares: con un jugador, el hueco haría que pareciera que hay dos.
  if (fichas.length < 2) return [];

  const jugadores = [...fichas];
  // Con impares se mete un hueco: quien le toque, descansa esa ronda.
  const HUECO = "__descansa__";
  if (jugadores.length % 2 === 1) jugadores.push(HUECO);

  const n = jugadores.length;
  const rondas: Ronda[] = [];
  // El primero se queda fijo y el resto rota: es el método del círculo.
  const rotativos = jugadores.slice(1);

  // Los colores NO se pueden repartir alternando por ronda. El método del círculo
  // deja a un jugador siempre en el mismo lado del emparejamiento, y con eso una
  // liguilla de 4 acaba con alguien que no lleva blancas ni una vez (comprobado:
  // era un bug real de la primera versión).
  //
  // Se reparten dando blancas, en cada emparejamiento, a quien menos las lleve
  // hasta ese momento. Empates: a quien acabara de llevar negras, y como último
  // recurso el orden alfabético de la ficha, para que el calendario sea
  // determinista y no dependa de en qué orden llegó la lista.
  const blancasDe = new Map<string, number>(fichas.map((f) => [f, 0]));
  const ultimoColor = new Map<string, Color>();

  for (let r = 0; r < n - 1; r++) {
    const orden = [jugadores[0], ...rotativos];
    const emparejamientos: Emparejamiento[] = [];
    let descansa: string | null = null;

    for (let i = 0; i < n / 2; i++) {
      const a = orden[i];
      const b = orden[n - 1 - i];
      if (a === HUECO || b === HUECO) {
        descansa = a === HUECO ? b : a;
        continue;
      }

      const blancasA = blancasDe.get(a) ?? 0;
      const blancasB = blancasDe.get(b) ?? 0;
      let conBlancas: string;
      if (blancasA !== blancasB) {
        conBlancas = blancasA < blancasB ? a : b;
      } else if (ultimoColor.get(a) !== ultimoColor.get(b)) {
        conBlancas = ultimoColor.get(a) === "negras" ? a : b;
      } else {
        conBlancas = a < b ? a : b;
      }
      const conNegras = conBlancas === a ? b : a;

      blancasDe.set(conBlancas, (blancasDe.get(conBlancas) ?? 0) + 1);
      ultimoColor.set(conBlancas, "blancas");
      ultimoColor.set(conNegras, "negras");
      emparejamientos.push({ blancas: conBlancas, negras: conNegras });
    }

    rondas.push({ numero: r + 1, emparejamientos, descansa });
    rotativos.unshift(rotativos.pop()!);
  }

  return equilibrarColores(rondas);
}

/**
 * Reparte los colores de una liguilla ya emparejada, de forma óptima.
 *
 * NO se puede hacer con un reparto codicioso ronda a ronda. Se probó, y con un
 * número impar de jugadores siempre deja a alguien con 3 blancas y 1 negras
 * aunque el 2-2 fuera posible; girar emparejamientos sueltos después tampoco
 * arregla nada, porque cada giro mueve a los dos jugadores dos puntos en sentidos
 * opuestos y la suma no baja.
 *
 * Visto como problema de grafos sí tiene solución exacta: los jugadores son
 * vértices, las partidas aristas, y dar color es ORIENTAR cada arista. El
 * desequilibrio de un jugador es su grado de salida menos el de entrada, y
 * recorriendo un circuito euleriano cada vértice recibe tantas entradas como
 * salidas. Es decir:
 *
 * - Con jugadores IMPARES cada uno juega un número par de partidas, todos los
 *   grados son pares, y el desequilibrio queda en CERO para todos.
 * - Con jugadores PARES los grados son impares, así que el ±1 es inevitable, y
 *   esto lo reparte de modo que nadie pase de ahí.
 *
 * Para que exista el circuito con grados impares se emparejan los vértices de
 * grado impar con aristas ficticias, que al recorrer se ignoran.
 */
function equilibrarColores(rondas: Ronda[]): Ronda[] {
  type Arista = { a: string; b: string; ronda: number; indice: number; ficticia: boolean };

  const aristas: Arista[] = [];
  rondas.forEach((r, iRonda) => {
    r.emparejamientos.forEach((e, i) => {
      aristas.push({ a: e.blancas, b: e.negras, ronda: iRonda, indice: i, ficticia: false });
    });
  });
  if (aristas.length === 0) return rondas;

  const grado = new Map<string, number>();
  for (const ar of aristas) {
    grado.set(ar.a, (grado.get(ar.a) ?? 0) + 1);
    grado.set(ar.b, (grado.get(ar.b) ?? 0) + 1);
  }

  // Aristas ficticias entre los de grado impar, de dos en dos y en orden fijo
  // para no perder el determinismo.
  const impares = [...grado.entries()]
    .filter(([, g]) => g % 2 === 1)
    .map(([v]) => v)
    .sort();
  for (let i = 0; i + 1 < impares.length; i += 2) {
    aristas.push({ a: impares[i], b: impares[i + 1], ronda: -1, indice: -1, ficticia: true });
  }

  const vecinos = new Map<string, { otro: string; arista: number }[]>();
  aristas.forEach((ar, i) => {
    if (!vecinos.has(ar.a)) vecinos.set(ar.a, []);
    if (!vecinos.has(ar.b)) vecinos.set(ar.b, []);
    vecinos.get(ar.a)!.push({ otro: ar.b, arista: i });
    vecinos.get(ar.b)!.push({ otro: ar.a, arista: i });
  });

  const usada = new Array(aristas.length).fill(false);
  const orientacion = new Map<number, { desde: string; hasta: string }>();
  const siguiente = new Map<string, number>([...vecinos.keys()].map((v) => [v, 0]));

  // Hierholzer: se recorre hasta agotar el componente, y cada arista se orienta
  // en el sentido en que se pasa por ella.
  for (const inicio of [...vecinos.keys()].sort()) {
    const pila = [inicio];
    while (pila.length > 0) {
      const v = pila[pila.length - 1];
      const lista = vecinos.get(v)!;
      let i = siguiente.get(v)!;
      while (i < lista.length && usada[lista[i].arista]) i++;
      siguiente.set(v, i);
      if (i === lista.length) {
        pila.pop();
        continue;
      }
      const { otro, arista } = lista[i];
      usada[arista] = true;
      orientacion.set(arista, { desde: v, hasta: otro });
      pila.push(otro);
    }
  }

  for (let i = 0; i < aristas.length; i++) {
    const ar = aristas[i];
    if (ar.ficticia) continue;
    const o = orientacion.get(i);
    if (!o) continue;
    rondas[ar.ronda].emparejamientos[ar.indice] = {
      blancas: o.desde,
      negras: o.hasta,
    };
  }

  return rondas;
}

// ---------------------------------------------------------------------------
// Suizo
// ---------------------------------------------------------------------------

export type EstadoJugador = {
  ficha: string;
  /** Puntos acumulados en el torneo. */
  puntos: number;
  /** Para ordenar dentro del grupo de puntuación. */
  elo: number;
  /** Fichas contra las que ya ha jugado. */
  rivales: string[];
  /** Colores llevados, en orden. */
  colores: Color[];
  /** true si ya ha descansado alguna ronda. */
  haDescansado: boolean;
};

/** Cuántas blancas de más (positivo) o de menos (negativo) lleva. */
export function balanceColor(colores: Color[]): number {
  return colores.reduce((n, c) => n + (c === "blancas" ? 1 : -1), 0);
}

/**
 * Reparte los colores de un enfrentamiento.
 *
 * Le tocan blancas a quien más las deba, y si van igualados, a quien no las
 * llevara la ronda pasada. Como último recurso decide el ELO, para que la
 * asignación sea determinista y no dependa del orden de la lista.
 */
export function colorearEnfrentamiento(
  a: EstadoJugador,
  b: EstadoJugador
): Emparejamiento {
  const balanceA = balanceColor(a.colores);
  const balanceB = balanceColor(b.colores);

  if (balanceA !== balanceB) {
    // Quien tenga el balance más bajo (menos blancas) lleva blancas.
    return balanceA < balanceB
      ? { blancas: a.ficha, negras: b.ficha }
      : { blancas: b.ficha, negras: a.ficha };
  }

  const ultimoA = a.colores[a.colores.length - 1];
  const ultimoB = b.colores[b.colores.length - 1];
  if (ultimoA !== ultimoB) {
    return ultimoA === "negras"
      ? { blancas: a.ficha, negras: b.ficha }
      : { blancas: b.ficha, negras: a.ficha };
  }

  return a.elo >= b.elo
    ? { blancas: a.ficha, negras: b.ficha }
    : { blancas: b.ficha, negras: a.ficha };
}

/** Orden dentro del torneo: más puntos primero, y a igualdad, más ELO. */
function ordenar(jugadores: EstadoJugador[]): EstadoJugador[] {
  return [...jugadores].sort(
    (x, y) => y.puntos - x.puntos || y.elo - x.elo || x.ficha.localeCompare(y.ficha)
  );
}

/**
 * Empareja una ronda suiza.
 *
 * Recorre la lista ordenada por puntuación y va casando cada jugador con el
 * primero disponible contra el que no haya jugado. Si al final queda alguien
 * descolgado porque ya jugó contra todos los que quedaban, se permite la
 * repetición **antes que dejarlo sin partida**: un torneo de club con pocos
 * jugadores llega a ese punto enseguida, y quedarse sin emparejar es peor que
 * repetir rival.
 *
 * Devuelve también si hubo que repetir, para que el organizador lo sepa y pueda
 * ajustar a mano si quiere.
 */
export function emparejarSuizo(
  jugadores: EstadoJugador[],
  numeroRonda: number
): Ronda & { repeticiones: Emparejamiento[] } {
  const orden = ordenar(jugadores);
  const repeticiones: Emparejamiento[] = [];

  // Con impares descansa el último de la clasificación que no haya descansado
  // todavía: así el descanso rota y no le cae siempre al mismo.
  let descansa: string | null = null;
  let disponibles = orden;
  if (orden.length % 2 === 1) {
    const candidato =
      [...orden].reverse().find((j) => !j.haDescansado) ?? orden[orden.length - 1];
    descansa = candidato.ficha;
    disponibles = orden.filter((j) => j.ficha !== descansa);
  }

  const emparejamientos: Emparejamiento[] = [];
  const pendientes = [...disponibles];

  while (pendientes.length > 1) {
    const a = pendientes.shift()!;
    // Primero, alguien contra quien no haya jugado.
    let i = pendientes.findIndex((b) => !a.rivales.includes(b.ficha));
    let esRepeticion = false;
    if (i === -1) {
      // Ya ha jugado contra todos los que quedan: se repite el más cercano en
      // puntuación, que es el primero de la lista ordenada.
      i = 0;
      esRepeticion = true;
    }
    const b = pendientes.splice(i, 1)[0];
    const par = colorearEnfrentamiento(a, b);
    emparejamientos.push(par);
    if (esRepeticion) repeticiones.push(par);
  }

  return { numero: numeroRonda, emparejamientos, descansa, repeticiones };
}

/**
 * Cuántas rondas caben en un suizo SIN que nadie repita rival.
 *
 * ES EL LARGO DE UN TODOS CONTRA TODOS, porque eso es exactamente el techo: cada jugador
 * tiene N−1 rivales posibles y no hay más. Con jugadores PARES son N−1 rondas; con
 * IMPARES son N, porque cada ronda descansa uno y hace falta una vuelta más para que
 * todos se hayan cruzado.
 *
 * POR QUÉ HACE FALTA SABERLO (2026-08-26): el propietario montó un suizo de 5 jugadores a
 * 4 rondas en ChessPairings y su motor se plantó en la ronda 4 con "no valid pairing
 * exists". Comprobado con sus datos: era imposible de verdad, no un fallo suyo — solo dos
 * jugadores no habían descansado, y cada uno ya había jugado contra los tres que
 * quedaban.
 *
 * NUESTRO SUIZO NO SE PLANTA, y ahí está el peligro: cuando alguien ya ha jugado contra
 * todos los que quedan, `emparejarSuizo` REPITE el enfrentamiento más cercano en puntos y
 * lo apunta en `repeticiones`. Es la decisión correcta para un torneo de club —mejor una
 * revancha que una ronda que no se puede jugar— pero durante meses esa lista no la miraba
 * nadie, así que la repetición pasaba en silencio. Con esto se puede avisar antes.
 */
export function rondasSinRepetir(jugadores: number): number {
  if (jugadores < 2) return 0;
  return jugadores % 2 === 0 ? jugadores - 1 : jugadores;
}

/**
 * El aviso que hay que dar antes de emparejar un suizo, o null si no hay nada que decir.
 *
 * SE DICE ANTES Y NO DESPUÉS: enterarse de que la ronda 4 repite dos partidas cuando ya
 * está generada obliga a borrarla, y borrar una ronda con resultados reescribe la
 * clasificación.
 */
export function avisoDeSuizo(jugadores: number, rondas: number): string | null {
  if (jugadores < 2 || rondas < 1) return null;
  const tope = rondasSinRepetir(jugadores);
  if (rondas <= tope) return null;
  return (
    `Con ${jugadores} jugadores solo caben ${tope} rondas sin repetir rival, y este torneo ` +
    `tiene ${rondas}. A partir de la ${tope + 1} habrá revanchas. ` +
    `Con tan pocos jugadores, una liguilla son ${tope} rondas y no repite ninguna.`
  );
}

/**
 * Rondas recomendadas para un suizo según el número de jugadores: las justas para
 * que salga un ganador claro, que es aproximadamente log2(N) redondeado arriba,
 * con un mínimo de 3.
 */
export function rondasRecomendadas(jugadores: number): number {
  if (jugadores < 2) return 0;
  return Math.max(3, Math.ceil(Math.log2(jugadores)));
}
