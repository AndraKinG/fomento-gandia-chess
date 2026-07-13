export type ElosJugador = {
  eloFide: number | null;
  eloFeda: number | null;
  eloOtro: number | null;
};

/** Fuerza del jugador según RGC FACV art. 52.1-52.2. */
export function fuerza(e: ElosJugador): number {
  const oficiales = [e.eloFeda, e.eloFide].filter(
    (x): x is number => typeof x === "number" && x > 0
  );
  if (oficiales.length > 0) return Math.max(...oficiales);
  if (typeof e.eloOtro === "number" && e.eloOtro > 0) return e.eloOtro;
  return 1400;
}
