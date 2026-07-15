import { describe, expect, it } from "vitest";
import { calcularMarcador, formatearPunto } from "./marcador";

describe("formatearPunto", () => {
  it.each([
    [0, "0"],
    [0.5, "½"],
    [1, "1"],
    [1.5, "1½"],
    [4, "4"],
    [4.5, "4½"],
    [8, "8"],
  ])("formatearPunto(%s) → %s", (n, esperado) => {
    expect(formatearPunto(n)).toBe(esperado);
  });
});

describe("calcularMarcador", () => {
  it("sin resultados aún: 0 – 0, completos 0", () => {
    const m = calcularMarcador([], 8);
    expect(m).toEqual({ nuestro: 0, rival: 0, completos: 0, total: 8, texto: "0 – 0" });
  });

  it("parcial: 3 tableros anotados (1, 0.5, 0) de 8", () => {
    const m = calcularMarcador([1, 0.5, 0], 8);
    expect(m.nuestro).toBe(1.5);
    expect(m.rival).toBe(1.5);
    expect(m.completos).toBe(3);
    expect(m.total).toBe(8);
    expect(m.texto).toBe("1½ – 1½");
  });

  it("completo, victoria clara: 4½ – 3½ (8 tableros)", () => {
    const resultados = [1, 1, 1, 1, 0.5, 0, 0, 0];
    const m = calcularMarcador(resultados, 8);
    expect(m.nuestro).toBe(4.5);
    expect(m.rival).toBe(3.5);
    expect(m.completos).toBe(8);
    expect(m.texto).toBe("4½ – 3½");
  });

  it("completo, derrota: 0 – 8 (nuestro resultado siempre primero)", () => {
    const resultados = new Array(8).fill(0);
    const m = calcularMarcador(resultados, 8);
    expect(m.texto).toBe("0 – 8");
  });
});
