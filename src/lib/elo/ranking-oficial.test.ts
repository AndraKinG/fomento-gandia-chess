import { describe, expect, it } from "vitest";
import {
  estadisticasClub,
  etiquetaNumero,
  ordenarPorElo,
  type JugadorRanking,
} from "./ranking-oficial";

function j(nombre: string, eloOficial: number | null, numero = 1, bisIndex = 0): JugadorRanking {
  return { nombre, eloOficial, numero, bisIndex };
}

describe("ordenarPorElo", () => {
  it("ordena de mayor a menor", () => {
    const r = ordenarPorElo([j("Ana", 1800), j("Bea", 2100), j("Caro", 1500)]);
    expect(r.map((x) => x.nombre)).toEqual(["Bea", "Ana", "Caro"]);
  });

  it("manda al final a quien no tiene ELO, no al principio", () => {
    // Esto es lo que se rompía: `null` en la resta da NaN y el orden salía
    // cualquiera, incluido dejar al que no tiene ELO de primero del club.
    const r = ordenarPorElo([j("SinElo", null), j("Ana", 1800), j("Bea", 2100)]);
    expect(r.map((x) => x.nombre)).toEqual(["Bea", "Ana", "SinElo"]);
  });

  it("con varios sin ELO, todos al final y entre ellos por nombre", () => {
    const r = ordenarPorElo([j("Zoe", null), j("Ana", null), j("Bea", 1600)]);
    expect(r.map((x) => x.nombre)).toEqual(["Bea", "Ana", "Zoe"]);
  });

  it("los empates de ELO se deshacen por nombre", () => {
    const r = ordenarPorElo([j("Zoe", 1700), j("Ana", 1700)]);
    expect(r.map((x) => x.nombre)).toEqual(["Ana", "Zoe"]);
  });

  it("no toca la lista original", () => {
    const original = [j("Ana", 1500), j("Bea", 2000)];
    ordenarPorElo(original);
    expect(original.map((x) => x.nombre)).toEqual(["Ana", "Bea"]);
  });

  it("aguanta una lista vacía", () => {
    expect(ordenarPorElo([])).toEqual([]);
  });
});

describe("estadisticasClub", () => {
  it("cuenta jugadores y calcula media y máximo", () => {
    const e = estadisticasClub([j("Ana", 1800), j("Bea", 2100), j("Caro", 1500)]);
    expect(e.jugadores).toBe(3);
    // (1800 + 2100 + 1500) / 3 = 1800
    expect(e.media).toBe(1800);
    expect(e.maximo).toBe(2100);
  });

  it("redondea la media", () => {
    // (1800 + 1801) / 2 = 1800.5 -> 1801
    expect(estadisticasClub([j("Ana", 1800), j("Bea", 1801)]).media).toBe(1801);
  });

  it("los que no tienen ELO cuentan como jugadores pero no entran en la media", () => {
    const e = estadisticasClub([j("Ana", 2000), j("SinElo", null)]);
    expect(e.jugadores).toBe(2);
    expect(e.media).toBe(2000);
    expect(e.maximo).toBe(2000);
  });

  it("un ELO a 0 se descarta: en la base significa que no tiene", () => {
    const e = estadisticasClub([j("Ana", 2000), j("Cero", 0)]);
    expect(e.jugadores).toBe(2);
    expect(e.media).toBe(2000);
  });

  it("si nadie tiene ELO devuelve null y no 0", () => {
    const e = estadisticasClub([j("Ana", null), j("Bea", 0)]);
    expect(e.jugadores).toBe(2);
    expect(e.media).toBeNull();
    expect(e.maximo).toBeNull();
  });

  it("con lista vacía no divide por cero", () => {
    expect(estadisticasClub([])).toEqual({ jugadores: 0, media: null, maximo: null });
  });
});

describe("etiquetaNumero", () => {
  it("sin bis solo el número", () => {
    expect(etiquetaNumero(12, 0)).toBe("12");
  });

  it("con bis lo añade", () => {
    expect(etiquetaNumero(12, 1)).toBe("12bis");
  });
});
