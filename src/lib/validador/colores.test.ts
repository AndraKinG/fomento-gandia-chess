import { describe, expect, it } from "vitest";
import { colorDeTablero } from "./colores";

// RGC art. 59: en cada tablero, el jugador LOCAL juega blancas si el número
// de tablero es impar (y negras si es par); el visitante lleva el color
// contrario en ese mismo tablero. 8 tableros × 2 condiciones (local/visitante)
// = 16 casos.
describe("colorDeTablero (art. 59)", () => {
  describe("equipo local: blancas en impares, negras en pares", () => {
    for (let tablero = 1; tablero <= 8; tablero++) {
      const esperado = tablero % 2 === 1 ? "blancas" : "negras";
      it(`tablero ${tablero} → ${esperado}`, () => {
        expect(colorDeTablero(tablero, true)).toBe(esperado);
      });
    }
  });

  describe("equipo visitante: negras en impares, blancas en pares (inverso del local)", () => {
    for (let tablero = 1; tablero <= 8; tablero++) {
      const esperado = tablero % 2 === 1 ? "negras" : "blancas";
      it(`tablero ${tablero} → ${esperado}`, () => {
        expect(colorDeTablero(tablero, false)).toBe(esperado);
      });
    }
  });
});
