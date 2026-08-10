import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  esJuegoValido,
  JUEGO_POR_DEFECTO,
  JUEGOS_PIEZAS,
  juegoPiezas,
  rutaPieza,
} from "./piezas";

describe("juegoPiezas", () => {
  it("devuelve el juego de una clave guardada", () => {
    expect(juegoPiezas("fantasy").nombre).toBe("Fantasía");
  });

  it("con clave desconocida o vacía vuelve al clásico", () => {
    // Un dato viejo o escrito a mano no puede dejar el tablero sin piezas.
    expect(juegoPiezas("lego")).toBe(JUEGO_POR_DEFECTO);
    expect(juegoPiezas(null)).toBe(JUEGO_POR_DEFECTO);
    expect(juegoPiezas(undefined)).toBe(JUEGO_POR_DEFECTO);
  });

  it("el default es celtic, el de siempre", () => {
    expect(JUEGO_POR_DEFECTO.clave).toBe("celtic");
  });
});

describe("esJuegoValido", () => {
  it("acepta todas las claves del catálogo y rechaza el resto", () => {
    for (const j of JUEGOS_PIEZAS) expect(esJuegoValido(j.clave)).toBe(true);
    expect(esJuegoValido("lego")).toBe(false);
    expect(esJuegoValido("")).toBe(false);
  });
});

describe("rutaPieza", () => {
  it("monta la ruta con el formato de chess.js", () => {
    expect(rutaPieza("celtic", "w", "n")).toBe("/piezas/celtic/wN.svg");
    expect(rutaPieza("fantasy", "b", "K")).toBe("/piezas/fantasy/bK.svg");
  });
});

describe("las carpetas de verdad", () => {
  // ESTE TEST MIRA EL DISCO a propósito: el catálogo y las carpetas de
  // `public/piezas/` se editan por separado, y un juego en el catálogo sin sus
  // 12 SVG es un tablero sin piezas que no avisa hasta producción.
  const PIEZAS = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];

  it("cada juego del catálogo tiene sus 12 SVG en public/piezas/", () => {
    for (const j of JUEGOS_PIEZAS) {
      const ficheros = readdirSync(join(process.cwd(), "public", "piezas", j.clave));
      for (const p of PIEZAS) {
        expect(ficheros, `falta ${p}.svg en ${j.clave}`).toContain(`${p}.svg`);
      }
    }
  });
});
