import { describe, expect, it } from "vitest";
import {
  ELO_POR_DEFECTO,
  esperado,
  eloInicial,
  factorK,
  nuevoElo,
  recalcular,
  resultadoInverso,
  type PartidaElo,
} from "./elo";

describe("esperado", () => {
  it("dos jugadores iguales esperan medio punto", () => {
    expect(esperado(1800, 1800)).toBeCloseTo(0.5, 10);
  });

  it("400 puntos de ventaja son ~0.91", () => {
    expect(esperado(2200, 1800)).toBeCloseTo(0.909, 3);
  });

  it("es simétrico: lo que espera uno es lo que no espera el otro", () => {
    expect(esperado(1750, 1900) + esperado(1900, 1750)).toBeCloseTo(1, 10);
  });

  it("nunca sale del rango 0-1 ni con diferencias enormes", () => {
    expect(esperado(3000, 100)).toBeLessThanOrEqual(1);
    expect(esperado(100, 3000)).toBeGreaterThanOrEqual(0);
  });
});

describe("factorK", () => {
  it.each([
    [0, 40],
    [14, 40],
    [15, 20],
    [200, 20],
  ])("con %i partidas jugadas, K = %i", (partidas, k) => {
    expect(factorK(partidas)).toBe(k);
  });
});

describe("eloInicial", () => {
  it("arranca del ELO oficial más alto y no de 1500", () => {
    // En un club la fuerza ya se conoce: empezar todos en 1500 daria un ranking
    // absurdo durante meses.
    expect(eloInicial({ eloFacv: 1850, eloFide: 1800, eloFeda: 1820 })).toBe(1850);
  });

  it("ignora los que faltan o son cero", () => {
    expect(eloInicial({ eloFacv: null, eloFide: 1700, eloFeda: 0 })).toBe(1700);
  });

  it("sin ningún oficial, el de por defecto", () => {
    expect(eloInicial({})).toBe(ELO_POR_DEFECTO);
    expect(eloInicial({ eloFacv: null, eloFide: null, eloFeda: null })).toBe(
      ELO_POR_DEFECTO
    );
  });
});

describe("nuevoElo", () => {
  it("ganar a un igual sube la mitad de K", () => {
    const c = nuevoElo(1800, 1800, "1", 50); // K = 20
    expect(c.delta).toBe(10);
    expect(c.despues).toBe(1810);
  });

  it("perder contra un igual baja lo mismo", () => {
    expect(nuevoElo(1800, 1800, "0", 50).delta).toBe(-10);
  });

  it("las tablas entre iguales no mueven nada", () => {
    expect(nuevoElo(1800, 1800, "0.5", 50).delta).toBe(0);
  });

  it("ganar al favorito sube mucho más", () => {
    const sorpresa = nuevoElo(1600, 2000, "1", 50);
    const esperada = nuevoElo(2000, 1600, "1", 50);
    expect(sorpresa.delta).toBeGreaterThan(esperada.delta);
    expect(sorpresa.delta).toBe(18);
    expect(esperada.delta).toBe(2);
  });

  it("las tablas contra alguien mucho mejor SUBEN", () => {
    expect(nuevoElo(1600, 2000, "0.5", 50).delta).toBeGreaterThan(0);
  });

  it("un provisional se mueve el doble que un asentado", () => {
    const nuevo = nuevoElo(1800, 1800, "1", 0); // K = 40
    const veterano = nuevoElo(1800, 1800, "1", 50); // K = 20
    expect(nuevo.delta).toBe(2 * veterano.delta);
  });

  it("redondea, no trunca: entre casi iguales el ELO no se congela", () => {
    // Con truncado, un delta de 0.6 se iria a 0 y jugadores parejos no se
    // moverian nunca.
    const c = nuevoElo(1800, 1790, "1", 50);
    expect(c.delta).not.toBe(0);
  });
});

describe("resultadoInverso", () => {
  it.each([
    ["1", "0"],
    ["0", "1"],
    ["0.5", "0.5"],
  ] as const)("%s visto del otro lado es %s", (a, b) => {
    expect(resultadoInverso(a)).toBe(b);
  });
});

describe("recalcular", () => {
  const inicial = { ana: 1800, bea: 1800, cris: 1600 };

  it("una partida mueve a los dos en sentidos opuestos", () => {
    const r = recalcular([{ blancas: "ana", negras: "bea", resultado: "1" }], inicial);
    // K = 40 (provisional) por (1 − 0.5 esperado) = 20 puntos, no 40: el delta es
    // K por la DIFERENCIA con lo esperado, no K entero.
    expect(r.ana.elo).toBe(1820);
    expect(r.bea.elo).toBe(1780);
    expect(r.ana.partidas).toBe(1);
  });

  it("usa los ELO de ANTES de la partida para los dos lados", () => {
    // Si se aplicara primero el de blancas, las negras jugarian contra un rival
    // ya modificado y el resultado dependeria del orden de proceso. La suma de
    // los cambios entre iguales tiene que ser cero.
    const r = recalcular([{ blancas: "ana", negras: "bea", resultado: "1" }], inicial);
    expect(r.ana.elo - 1800 + (r.bea.elo - 1800)).toBe(0);
  });

  it("las tablas entre desiguales acercan a los dos", () => {
    const r = recalcular([{ blancas: "ana", negras: "cris", resultado: "0.5" }], inicial);
    expect(r.ana.elo).toBeLessThan(1800);
    expect(r.cris.elo).toBeGreaterThan(1600);
  });

  it("quien no está en la lista inicial arranca del ELO por defecto", () => {
    const r = recalcular([{ blancas: "nuevo", negras: "otro", resultado: "1" }], {});
    expect(r.nuevo.elo).toBe(ELO_POR_DEFECTO + 20);
    expect(r.otro.elo).toBe(ELO_POR_DEFECTO - 20);
  });

  it("es determinista: la misma lista da el mismo resultado", () => {
    const partidas: PartidaElo[] = [
      { blancas: "ana", negras: "bea", resultado: "1" },
      { blancas: "cris", negras: "ana", resultado: "0.5" },
      { blancas: "bea", negras: "cris", resultado: "0" },
    ];
    expect(recalcular(partidas, inicial)).toEqual(recalcular(partidas, inicial));
  });

  it("el orden de las partidas importa, porque el K cambia con las jugadas", () => {
    const a: PartidaElo[] = [
      { blancas: "ana", negras: "bea", resultado: "1" },
      { blancas: "ana", negras: "cris", resultado: "0" },
    ];
    const b: PartidaElo[] = [a[1], a[0]];
    // Mismos resultados en distinto orden: el ELO final no tiene por que
    // coincidir, y el test lo documenta para que nadie asuma lo contrario.
    expect(recalcular(a, inicial).ana.elo).not.toBe(recalcular(b, inicial).ana.elo);
  });

  it("recalcular desde cero permite corregir una partida antigua", () => {
    const original: PartidaElo[] = [
      { blancas: "ana", negras: "bea", resultado: "1" },
      { blancas: "ana", negras: "cris", resultado: "1" },
    ];
    const corregida: PartidaElo[] = [
      { blancas: "ana", negras: "bea", resultado: "0" }, // se corrige la ronda 1
      original[1],
    ];
    const antes = recalcular(original, inicial);
    const despues = recalcular(corregida, inicial);
    expect(despues.ana.elo).toBeLessThan(antes.ana.elo);
    // Y la cuenta de partidas no se descuadra al recalcular.
    expect(despues.ana.partidas).toBe(2);
  });

  it("sin partidas no hay ELO que devolver", () => {
    expect(recalcular([], inicial)).toEqual({});
  });
});
