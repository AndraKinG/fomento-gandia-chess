import { Chess } from "chess.js";
import { banderaCaida, parado, trasJugada, type Cadencia, type Reloj } from "./reloj";

/**
 * Una jugada de una partida en vivo, de principio a fin.
 *
 * ESTO SE EJECUTA EN EL SERVIDOR, SIEMPRE. El navegador pinta el tablero y propone
 * jugadas, pero quien dice si son legales, a quién le tocaba y cuánto tiempo queda
 * es esto. Confiar en el cliente en una partida puntuable es dejar que cualquiera
 * mueva dos veces seguidas, mueva por el rival o no pierda nunca por tiempo.
 *
 * MÓDULO PURO: entra el estado de la partida y sale el siguiente. Sin base de datos
 * y sin `Date.now()` — el "ahora" es un parámetro, que es lo que permite probar una
 * caída de bandera sin esperar cinco minutos.
 */

export type Resultado = "1-0" | "0-1" | "1/2-1/2";

/** Por qué se acabó. Se guarda además del resultado porque "0-1 por abandono" y
 *  "0-1 por mate" no son lo mismo ni para el jugador ni para el acta. */
export type Motivo =
  | "mate"
  | "tiempo"
  | "abandono"
  | "ahogado"
  | "tablas-acordadas"
  | "material-insuficiente"
  | "triple-repeticion"
  | "regla-50";

export type Estado = {
  /** Jugadas en notación algebraica, en orden. El FEN se reconstruye de aquí: una
   *  sola fuente de verdad, y así no pueden discrepar. */
  jugadas: string[];
  reloj: Reloj;
  cadencia: Cadencia;
  resultado: Resultado | null;
  motivo: Motivo | null;
};

export type Fin = { resultado: Resultado; motivo: Motivo };

export type Jugada = { desde: string; hasta: string; corona?: string };

export type Resultante =
  | { ok: true; estado: Estado; san: string }
  | { ok: false; error: string; estado?: Estado };

export function partidaNueva(cadencia: Cadencia, reloj: Reloj): Estado {
  return { jugadas: [], reloj, cadencia, resultado: null, motivo: null };
}

/** Reconstruye la posición a partir de las jugadas. */
export function posicionDe(jugadas: readonly string[]): Chess {
  const c = new Chess();
  for (const j of jugadas) c.move(j);
  return c;
}

/**
 * Mira si la posición está acabada por reglas de ajedrez.
 *
 * El ahogado y las tablas técnicas se detectan SOLOS, sin que nadie las reclame:
 * en un club nadie va a saber reclamar la regla de las 50 jugadas, y una partida
 * que sigue después de un ahogado es un error que se ve en el acta.
 */
export function finPorReglas(c: Chess): Fin | null {
  if (c.isCheckmate()) {
    // Da mate quien acaba de mover, o sea el contrario del que tiene el turno.
    return { resultado: c.turn() === "w" ? "0-1" : "1-0", motivo: "mate" };
  }
  if (c.isStalemate()) return { resultado: "1/2-1/2", motivo: "ahogado" };
  if (c.isInsufficientMaterial()) {
    return { resultado: "1/2-1/2", motivo: "material-insuficiente" };
  }
  if (c.isThreefoldRepetition()) {
    return { resultado: "1/2-1/2", motivo: "triple-repeticion" };
  }
  if (c.isDraw()) return { resultado: "1/2-1/2", motivo: "regla-50" };
  return null;
}

/** Gana el rival de quien se quedó sin tiempo. */
export function finPorTiempo(seLeAcaboA: "w" | "b"): Fin {
  return { resultado: seLeAcaboA === "w" ? "0-1" : "1-0", motivo: "tiempo" };
}

/** Gana el rival de quien abandona. */
export function finPorAbandono(abandona: "w" | "b"): Fin {
  return { resultado: abandona === "w" ? "0-1" : "1-0", motivo: "abandono" };
}

/**
 * Aplica una jugada, si procede.
 *
 * EL ORDEN DE LAS COMPROBACIONES IMPORTA y no es casual:
 *
 * 1. Partida acabada → no se mueve. Evita que una jugada que llega tarde reviva una
 *    partida ya cerrada.
 * 2. Turno → antes que la legalidad, porque el mensaje "no es tu turno" es el útil.
 * 3. **Bandera ANTES que la jugada.** Si el tiempo se agotó mientras pensaba, la
 *    partida ya estaba perdida: dejar pasar la jugada sería premiar al que tarda
 *    más de la cuenta en mandarla.
 * 4. Legalidad, que la pone `chess.js`.
 */
export function aplicarJugada(
  estado: Estado,
  quienMueve: "w" | "b",
  jugada: Jugada,
  ahora: number
): Resultante {
  if (estado.resultado !== null) {
    return { ok: false, error: "La partida ya ha terminado." };
  }
  if (estado.reloj.turno !== quienMueve) {
    return { ok: false, error: "No es tu turno." };
  }
  if (banderaCaida(estado.reloj, ahora)) {
    const fin = finPorTiempo(quienMueve);
    return {
      ok: false,
      error: "Se te ha acabado el tiempo.",
      // El reloj se PARA, igual que en `reclamarTiempo`: este también es un final por
      // tiempo, y sin parar el reloj el tablero final enseñaba al que perdió con el
      // tiempo que tenía en su última jugada.
      estado: { ...estado, reloj: parado(estado.reloj, ahora), resultado: fin.resultado, motivo: fin.motivo },
    };
  }

  const c = posicionDe(estado.jugadas);
  let san: string;
  try {
    const m = c.move({ from: jugada.desde, to: jugada.hasta, promotion: jugada.corona });
    san = m.san;
  } catch {
    return { ok: false, error: "Esa jugada no es legal." };
  }

  const siguiente: Estado = {
    ...estado,
    jugadas: [...estado.jugadas, san],
    reloj: trasJugada(estado.reloj, estado.cadencia, ahora),
  };

  const fin = finPorReglas(c);
  if (fin) {
    siguiente.resultado = fin.resultado;
    siguiente.motivo = fin.motivo;
  }
  return { ok: true, estado: siguiente, san };
}

/**
 * Cierra la partida por tiempo si de verdad se ha caído la bandera.
 *
 * Hace falta porque una partida puede acabarse SIN QUE NADIE MUEVA: si el rival se
 * va, nadie manda ninguna jugada y sin esto la partida se quedaría abierta para
 * siempre. Lo pide el que espera, y aquí se comprueba de verdad — no basta con que
 * lo diga.
 */
export function reclamarTiempo(estado: Estado, ahora: number): Estado | null {
  if (estado.resultado !== null) return null;
  if (!banderaCaida(estado.reloj, ahora)) return null;
  const fin = finPorTiempo(estado.reloj.turno);
  // El reloj se PARA al cerrar: si no, la fila se queda con los milisegundos del
  // instante de la última jugada y al terminar se enseña más tiempo del que había.
  return {
    ...estado,
    reloj: parado(estado.reloj, ahora),
    resultado: fin.resultado,
    motivo: fin.motivo,
  };
}

/**
 * Margen antes de que el cron dé por abandonada una partida con la bandera caída.
 *
 * NO ES PARA QUE EL RESULTADO SEA OTRO: con la bandera caída la partida está perdida y
 * ninguna jugada la salva (`aplicarJugada` mira la bandera antes que la jugada). Es para
 * el jugador que SÍ está: si la bandera acaba de caer, le toca a él pulsar "reclamar" y
 * verlo en su mesa, no que el cron se le adelante a la vez. Una hora sobra.
 */
export const MARGEN_ABANDONO_MS = 60 * 60 * 1000;

/**
 * ¿Hay que cerrar esta partida porque la han abandonado?
 *
 * Mira LO MISMO que `reclamarTiempo` —sin resultado y con la bandera caída— pero
 * contándolo un margen atrás. El cierre lo hace después `reclamarTiempo`, la misma
 * función que usa el botón: el cron no tiene reglas propias, hace lo que habría hecho
 * quien esperaba si hubiera pulsado.
 *
 * UNA PARTIDA CUYO RELOJ NUNCA HA ARRANCADO NO SE CIERRA por aquí: el reloj no arranca
 * hasta la primera jugada, así que la bandera no puede caer y no hay a quién darle la
 * partida. Ojo, no es lo mismo que "sin jugadas": si se devuelve la primera jugada, la
 * lista queda vacía pero el reloj ya corre, y esa sí se puede cerrar (igual que con el
 * botón).
 */
export function abandonadaPorTiempo(estado: Estado, ahora: number): boolean {
  return estado.resultado === null && banderaCaida(estado.reloj, ahora - MARGEN_ABANDONO_MS);
}

/** Lo que el cron hace con una partida abierta: nada, cerrarla por tiempo o anularla. */
export type DestinoAbandonada = "nada" | "cerrar" | "anular";

/**
 * ¿Qué hay que hacer con esta partida si la han abandonado?
 *
 * UNA PARTIDA NO HA EMPEZADO MIENTRAS ALGUNO DE LOS DOS NO HAYA HECHO SU PRIMERA JUGADA
 * (decisión del propietario, 2026-11-10; es la regla de Lichess). Abandonada así, se
 * ANULA y se borra: darle la victoria a uno por un 1.e4 sin respuesta no dice nada de
 * quién juega mejor. Las que sí empezaron se CIERRAN por tiempo con la regla del botón
 * (`abandonadaPorTiempo` + `reclamarTiempo`).
 *
 * "Abandonada" es lo mismo en los dos casos: a quien le toca mover se le habría acabado
 * el tiempo, más el margen. Si nadie ha movido el reloj no ha arrancado, así que se
 * cuenta desde que se abrió la mesa (`creadaEn`), como si hubiera arrancado entonces.
 *
 * OJO, EL BOTÓN NO CAMBIA: si en una partida sin empezar el que está pulsa "reclamar"
 * cuando al otro se le acaba el tiempo, gana. Esto es solo lo que hace el cron con las
 * que nadie ha reclamado.
 */
export function destinoDeAbandonada(
  estado: Estado,
  creadaEn: number,
  ahora: number
): DestinoAbandonada {
  if (estado.resultado !== null) return "nada";
  if (estado.jugadas.length >= 2) return abandonadaPorTiempo(estado, ahora) ? "cerrar" : "nada";
  const reloj =
    estado.reloj.ultimaJugadaEn === null ? { ...estado.reloj, ultimaJugadaEn: creadaEn } : estado.reloj;
  return banderaCaida(reloj, ahora - MARGEN_ABANDONO_MS) ? "anular" : "nada";
}

/**
 * PGN de la partida, para que acabe en el repositorio como una más.
 *
 * Se monta a mano y no con `chess.js` porque hay que meterle las cabeceras del club
 * y el resultado, que `chess.js` no conoce.
 */
export function aPgn(
  estado: Estado,
  datos: { blancas: string; negras: string; fecha: string; evento?: string }
): string {
  const resultado = estado.resultado ?? "*";
  const cabeceras = [
    `[Event "${datos.evento ?? "Partida en la app"}"]`,
    `[Site "Fomento de Gandia"]`,
    `[Date "${datos.fecha.replaceAll("-", ".")}"]`,
    `[White "${datos.blancas}"]`,
    `[Black "${datos.negras}"]`,
    `[Result "${resultado}"]`,
  ].join("\n");

  const cuerpo = estado.jugadas
    .map((j, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${j}` : j))
    .join(" ");
  return `${cabeceras}\n\n${cuerpo}${cuerpo ? " " : ""}${resultado}`;
}
