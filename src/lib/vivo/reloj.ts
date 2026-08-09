/**
 * El reloj de una partida en vivo.
 *
 * TODO ESTO VIVE EN EL SERVIDOR, y no es una manía: un reloj que lleva el navegador
 * es un reloj que se puede parar. Basta con adelantar la hora del sistema o no
 * mandar la jugada para no perder nunca por tiempo. Aquí el tiempo se descuenta a
 * partir de la marca que dejó la jugada anterior, y esa marca la pone la base.
 *
 * MÓDULO PURO: recibe milisegundos y devuelve milisegundos. Ni base de datos, ni
 * `Date.now()` escondido — el "ahora" entra por parámetro, que es lo que permite
 * probar una caída de bandera sin esperar tres minutos.
 *
 * QUÉ NO HACE: no sabe de ajedrez. Que la partida termine por mate o por ahogado es
 * cosa de `partida.ts`; aquí solo se cuenta el tiempo.
 */

/** Cómo se reparte el tiempo. `incrementoMs` es lo que se suma AL TERMINAR de mover
 *  (Fischer), que es lo que usan la FACV y todo el mundo. */
export type Cadencia = { baseMs: number; incrementoMs: number };

export type Reloj = {
  blancasMs: number;
  negrasMs: number;
  /** Cuándo se registró la última jugada. null = la partida aún no ha empezado. */
  ultimaJugadaEn: number | null;
  /** A quién le corre el reloj ahora mismo. */
  turno: "w" | "b";
};

export function relojInicial(cadencia: Cadencia): Reloj {
  return {
    blancasMs: cadencia.baseMs,
    negrasMs: cadencia.baseMs,
    ultimaJugadaEn: null,
    turno: "w",
  };
}

/**
 * Lo que le queda a quien tiene el turno, contando lo que lleva pensando.
 *
 * Es lo que hay que mirar para saber si se le ha caído la bandera, y también lo que
 * el navegador pinta en la cuenta atrás. Nunca baja de cero: un número negativo en
 * pantalla no significa nada.
 */
export function restanteDeQuienMueve(reloj: Reloj, ahora: number): number {
  const acumulado = reloj.turno === "w" ? reloj.blancasMs : reloj.negrasMs;
  // Antes de la primera jugada el reloj no ha arrancado: nadie pierde por pensarse
  // la salida mientras el rival todavía no ha entrado.
  if (reloj.ultimaJugadaEn === null) return acumulado;
  return Math.max(0, acumulado - (ahora - reloj.ultimaJugadaEn));
}

/** true si a quien le toca mover se le ha acabado el tiempo. */
export function banderaCaida(reloj: Reloj, ahora: number): boolean {
  return restanteDeQuienMueve(reloj, ahora) <= 0;
}

/**
 * Aplica una jugada al reloj: descuenta lo pensado, suma el incremento y pasa el
 * turno.
 *
 * EL INCREMENTO SE SUMA DESPUÉS de descontar, y solo si quedaba tiempo. Sumarlo
 * antes regalaría una jugada a quien ya se había quedado a cero, que es justo la
 * que no debería poder hacer.
 */
export function trasJugada(reloj: Reloj, cadencia: Cadencia, ahora: number): Reloj {
  const restante = restanteDeQuienMueve(reloj, ahora);
  // LA PRIMERA JUGADA NO SUMA INCREMENTO. El reloj no arranca hasta que alguien
  // mueve —para que nadie pierda mientras espera a que el rival entre—, así que en
  // esa jugada no se ha gastado nada; sumarle el incremento dejaba a las blancas con
  // MÁS tiempo del que empezaron (5:00 → 5:03 sin haber pensado), y eso se lee como
  // un error aunque el reloj vaya bien.
  const arrancado = reloj.ultimaJugadaEn !== null;
  const nuevo = restante <= 0 ? 0 : restante + (arrancado ? cadencia.incrementoMs : 0);
  return {
    blancasMs: reloj.turno === "w" ? nuevo : reloj.blancasMs,
    negrasMs: reloj.turno === "b" ? nuevo : reloj.negrasMs,
    ultimaJugadaEn: ahora,
    turno: reloj.turno === "w" ? "b" : "w",
  };
}

/**
 * El reloj PARADO: se descuenta lo que llevaba pensando quien tenía el turno y se
 * deja de contar.
 *
 * Es lo que hay que guardar cuando una partida se acaba sin jugada —abandono, tablas
 * acordadas, bandera—, y no es un detalle: sin esto la fila conserva los
 * milisegundos del INSTANTE DE LA ÚLTIMA JUGADA, así que al terminar la partida los
 * dos relojes daban un salto hacia arriba y enseñaban más tiempo del que les
 * quedaba de verdad. Pasó de verdad al abandonar.
 *
 * `ultimaJugadaEn` a null es lo que dice "ya no corre": es la misma marca que usa el
 * navegador para saber si tiene que seguir la cuenta atrás.
 */
export function parado(reloj: Reloj, ahora: number): Reloj {
  const restante = restanteDeQuienMueve(reloj, ahora);
  return {
    blancasMs: reloj.turno === "w" ? restante : reloj.blancasMs,
    negrasMs: reloj.turno === "b" ? restante : reloj.negrasMs,
    ultimaJugadaEn: null,
    turno: reloj.turno,
  };
}

/**
 * Los dos relojes tal como hay que pintarlos, con el del que mueve ya descontado.
 *
 * El navegador sigue la cuenta atrás por su cuenta entre jugada y jugada, pero
 * arranca SIEMPRE de estos números: si dejara correr su propio reloj desde el
 * principio, la diferencia con el servidor iría creciendo hasta que uno viera
 * bandera y el otro no.
 */
export function paraPintar(reloj: Reloj, ahora: number): { blancasMs: number; negrasMs: number } {
  const restante = restanteDeQuienMueve(reloj, ahora);
  return {
    blancasMs: reloj.turno === "w" ? restante : reloj.blancasMs,
    negrasMs: reloj.turno === "b" ? restante : reloj.negrasMs,
  };
}

/**
 * Tiempo en `m:ss`, y en `m:ss.d` en el último medio minuto.
 *
 * La décima aparece solo al final a propósito: durante la partida es ruido que
 * parpadea, y en los últimos segundos es justo lo que se mira.
 */
export function enReloj(ms: number): string {
  const total = Math.max(0, ms);
  const minutos = Math.floor(total / 60_000);
  const segundos = Math.floor((total % 60_000) / 1000);
  if (total >= 30_000) {
    return `${minutos}:${String(segundos).padStart(2, "0")}`;
  }
  const decimas = Math.floor((total % 1000) / 100);
  return `${minutos}:${String(segundos).padStart(2, "0")}.${decimas}`;
}
