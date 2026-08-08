import { describe, expect, it } from "vitest";
import { blancasEnAmistosa } from "./colores";

const YO = "joan";
const EL = "emilio";

const base = { retaId: YO, retadoId: EL, quiere: "azar" as const, ultimo: null, moneda: 0.1 };

describe("blancasEnAmistosa", () => {
  it("si quien reta pide blancas, las lleva", () => {
    expect(blancasEnAmistosa({ ...base, quiere: "blancas" })).toBe(YO);
  });

  it("si quien reta pide negras, las blancas son del otro", () => {
    expect(blancasEnAmistosa({ ...base, quiere: "negras" })).toBe(EL);
  });

  it("la elección manda aunque haya historial", () => {
    // Quien acepta ve el color en el reto, así que no hay sorpresa.
    const ultimo = { blancasId: YO, negrasId: EL };
    expect(blancasEnAmistosa({ ...base, quiere: "blancas", ultimo })).toBe(YO);
  });

  it("el primer encuentro se sortea", () => {
    expect(blancasEnAmistosa({ ...base, moneda: 0.2 })).toBe(YO);
    expect(blancasEnAmistosa({ ...base, moneda: 0.8 })).toBe(EL);
  });

  it("justo en la mitad cae del lado del retado", () => {
    expect(blancasEnAmistosa({ ...base, moneda: 0.5 })).toBe(EL);
  });

  it("del segundo en adelante, alterna", () => {
    // Llevé blancas la última vez: ahora me tocan negras.
    expect(
      blancasEnAmistosa({ ...base, ultimo: { blancasId: YO, negrasId: EL }, moneda: 0.1 })
    ).toBe(EL);
    expect(
      blancasEnAmistosa({ ...base, ultimo: { blancasId: EL, negrasId: YO }, moneda: 0.9 })
    ).toBe(YO);
  });

  it("al alternar, la moneda no pinta nada", () => {
    const ultimo = { blancasId: YO, negrasId: EL };
    expect(blancasEnAmistosa({ ...base, ultimo, moneda: 0 })).toBe(EL);
    expect(blancasEnAmistosa({ ...base, ultimo, moneda: 1 })).toBe(EL);
  });

  it("da igual quién de los dos rete: alterna respecto al encuentro", () => {
    // Ahora reta Emilio, y la última vez llevó blancas él.
    expect(
      blancasEnAmistosa({
        retaId: EL,
        retadoId: YO,
        quiere: "azar",
        ultimo: { blancasId: EL, negrasId: YO },
        moneda: 0.1,
      })
    ).toBe(YO);
  });

  it("un encuentro que no es de estos dos se ignora y se sortea", () => {
    // Comportamiento seguro: alternar con datos de otra pareja no significa nada.
    const deOtros = { blancasId: "otro", negrasId: "tercero" };
    expect(blancasEnAmistosa({ ...base, ultimo: deOtros, moneda: 0.2 })).toBe(YO);
    expect(blancasEnAmistosa({ ...base, ultimo: deOtros, moneda: 0.8 })).toBe(EL);
  });
});
