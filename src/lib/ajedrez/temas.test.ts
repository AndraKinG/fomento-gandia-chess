import { describe, expect, it } from "vitest";
import { esTemaValido, TEMA_POR_DEFECTO, TEMAS_TABLERO, temaTablero } from "./temas";

describe("temaTablero", () => {
  it("devuelve el tema de una clave guardada", () => {
    expect(temaTablero("madera").nombre).toBe("Madera");
  });

  it("con clave desconocida o vacía vuelve al del club", () => {
    // Un dato viejo o escrito a mano no puede dejar el tablero sin colores.
    expect(temaTablero("fucsia")).toBe(TEMA_POR_DEFECTO);
    expect(temaTablero(null)).toBe(TEMA_POR_DEFECTO);
    expect(temaTablero(undefined)).toBe(TEMA_POR_DEFECTO);
  });

  it("el default es el blanquiazul del club", () => {
    expect(TEMA_POR_DEFECTO.clave).toBe("gandiblues");
  });
});

describe("esTemaValido", () => {
  it("acepta todas las claves del catálogo y rechaza el resto", () => {
    for (const t of TEMAS_TABLERO) expect(esTemaValido(t.clave)).toBe(true);
    expect(esTemaValido("fucsia")).toBe(false);
    expect(esTemaValido("")).toBe(false);
  });
});

describe("catálogo", () => {
  it("no hay claves repetidas", () => {
    const claves = TEMAS_TABLERO.map((t) => t.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada tema tiene contraste real entre clara y oscura", () => {
    // Guarda mínima: si alguien añade un tema con las dos casillas casi iguales,
    // el tablero deja de leerse. Se compara la luminancia aproximada.
    const luz = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    };
    for (const t of TEMAS_TABLERO) {
      expect(Math.abs(luz(t.clara) - luz(t.oscura))).toBeGreaterThan(40);
    }
  });
});
