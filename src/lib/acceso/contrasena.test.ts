import { describe, expect, it } from "vitest";
import { LARGO_MINIMO, validarContrasena } from "./contrasena";

describe("validarContrasena", () => {
  it("una contraseña normal escrita dos veces igual vale", () => {
    expect(validarContrasena("caballoNegro7", "caballoNegro7")).toEqual({ ok: true });
  });

  it("justo en el mínimo vale", () => {
    const ocho = "a".repeat(LARGO_MINIMO);
    expect(validarContrasena(ocho, ocho)).toEqual({ ok: true });
  });

  it("una letra menos, no", () => {
    // El mínimo lo pone Supabase: dejarlo pasar aquí daría un error del servidor en
    // inglés, y el socio no sabría qué ha hecho mal.
    const siete = "a".repeat(LARGO_MINIMO - 1);
    const r = validarContrasena(siete, siete);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain(String(LARGO_MINIMO));
  });

  it("si las dos no coinciden, lo dice ANTES que lo del largo", () => {
    // Quien se ha equivocado repitiendo no necesita que le hablen del mínimo: la
    // corrección que tiene que hacer es otra.
    const r = validarContrasena("corta", "otracosa");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no son iguales");
  });

  it("solo espacios no es una contraseña", () => {
    const r = validarContrasena("        ", "        ");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("espacios");
  });

  it("un espacio al final se avisa, no se recorta en silencio", () => {
    // Recortarlo guardaría una contraseña distinta de la que el socio cree haber
    // escrito, y al entrar no le valdría: el fallo aparecería en OTRA pantalla.
    const r = validarContrasena("caballoNegro7 ", "caballoNegro7 ");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("espacio");
  });

  it("los espacios de en medio no molestan", () => {
    expect(validarContrasena("mi frase larga", "mi frase larga")).toEqual({ ok: true });
  });
});
