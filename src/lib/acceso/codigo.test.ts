import { describe, expect, it } from "vitest";
import { formatearCodigo, generarCodigo, normalizarCodigo } from "./codigo";

describe("generarCodigo", () => {
  it("devuelve 12 caracteres del alfabeto sin ambigüedades", () => {
    for (let i = 0; i < 50; i++) {
      const c = generarCodigo();
      expect(c).toHaveLength(12);
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
    }
  });

  it("no contiene los caracteres que se confunden al dictarlo (I, O, 0, 1)", () => {
    const muestra = Array.from({ length: 200 }, generarCodigo).join("");
    expect(muestra).not.toMatch(/[IO01]/);
  });

  it("no repite (50 códigos, 50 valores distintos)", () => {
    const codigos = new Set(Array.from({ length: 50 }, generarCodigo));
    expect(codigos.size).toBe(50);
  });
});

describe("normalizarCodigo", () => {
  it.each([
    ["CDRL85C3CAP6", "CDRL85C3CAP6"],
    ["cdrl85c3cap6", "CDRL85C3CAP6"],
    ["CDRL-85C3-CAP6", "CDRL85C3CAP6"],
    ["cdrl 85c3 cap6", "CDRL85C3CAP6"],
    ["  CDRL85C3CAP6\n", "CDRL85C3CAP6"],
    ["CDRL–85C3–CAP6", "CDRL85C3CAP6"], // guion largo del autocorrector del móvil
  ])("normaliza %j → %s", (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado);
  });

  it("un código pegado desde WhatsApp con salto de línea sigue valiendo", () => {
    expect(normalizarCodigo("CDRL-85C3-\nCAP6")).toBe("CDRL85C3CAP6");
  });

  it("cadena vacía o solo basura da cadena vacía (no coincidirá con nada)", () => {
    expect(normalizarCodigo("")).toBe("");
    expect(normalizarCodigo("---")).toBe("");
  });
});

describe("formatearCodigo", () => {
  it("agrupa de 4 en 4 para leerlo de un vistazo", () => {
    expect(formatearCodigo("CDRL85C3CAP6")).toBe("CDRL-85C3-CAP6");
  });

  it("es idempotente sobre un código ya formateado", () => {
    expect(formatearCodigo(formatearCodigo("CDRL85C3CAP6"))).toBe("CDRL-85C3-CAP6");
  });

  it("un código generado se puede formatear y volver a normalizar sin perder nada", () => {
    const c = generarCodigo();
    expect(normalizarCodigo(formatearCodigo(c))).toBe(c);
  });
});
