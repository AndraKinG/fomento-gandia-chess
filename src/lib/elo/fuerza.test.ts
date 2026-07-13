import { describe, expect, it } from "vitest";
import { fuerza } from "./fuerza";

describe("fuerza (RGC art. 52.1-52.2)", () => {
  it("usa el mayor entre FEDA y FIDE", () => {
    expect(fuerza({ eloFide: 2000, eloFeda: 2100, eloOtro: null })).toBe(2100);
    expect(fuerza({ eloFide: 2150, eloFeda: 2100, eloOtro: null })).toBe(2150);
  });
  it("con un solo ELO oficial, usa ese", () => {
    expect(fuerza({ eloFide: 1900, eloFeda: null, eloOtro: null })).toBe(1900);
    expect(fuerza({ eloFide: null, eloFeda: 1850, eloOtro: null })).toBe(1850);
  });
  it("sin oficiales usa el autonomico/extranjero", () => {
    expect(fuerza({ eloFide: null, eloFeda: null, eloOtro: 1700 })).toBe(1700);
  });
  it("sin ningun ELO devuelve 1400 ficticio", () => {
    expect(fuerza({ eloFide: null, eloFeda: null, eloOtro: null })).toBe(1400);
  });
  it("ignora ceros como ausencia de ELO", () => {
    expect(fuerza({ eloFide: 0, eloFeda: null, eloOtro: 0 })).toBe(1400);
  });
});
