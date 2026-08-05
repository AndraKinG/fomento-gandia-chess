import { describe, expect, it } from "vitest";
import { validarSolicitud } from "./ingreso";

const base = { nombre: "Ana García", email: "ana@ejemplo.com" };

describe("validarSolicitud", () => {
  it("acepta lo mínimo: nombre y email", () => {
    const r = validarSolicitud(base);
    expect(r).toEqual({
      ok: true,
      datos: { nombre: "Ana García", email: "ana@ejemplo.com", telefono: null, mensaje: null },
    });
  });

  it("normaliza el email a minúsculas", () => {
    const r = validarSolicitud({ ...base, email: "  Ana@Ejemplo.COM " });
    expect(r.ok && r.datos.email).toBe("ana@ejemplo.com");
  });

  it("colapsa los espacios del nombre que deja el copiar y pegar", () => {
    const r = validarSolicitud({ ...base, nombre: "  Ana   García  " });
    expect(r.ok && r.datos.nombre).toBe("Ana García");
  });

  it.each([
    ["", "vacío"],
    ["A", "una sola letra"],
    ["   ", "solo espacios"],
  ])("rechaza el nombre %j (%s)", (nombre) => {
    const r = validarSolicitud({ ...base, nombre });
    expect(r.ok).toBe(false);
  });

  it("rechaza un nombre absurdamente largo", () => {
    const r = validarSolicitud({ ...base, nombre: "a".repeat(200) });
    expect(r.ok).toBe(false);
  });

  it.each([
    "sinarroba",
    "sin@dominio",
    "@ejemplo.com",
    "ana@ejemplo",
    "con espacio@ejemplo.com",
    "",
  ])("rechaza el email %j", (email) => {
    expect(validarSolicitud({ ...base, email }).ok).toBe(false);
  });

  it.each([
    "ana@ejemplo.com",
    "ana.garcia+ajedrez@ejemplo.co.uk",
    "a@b.es",
    "ana_garcia@sub.dominio.org",
  ])("acepta el email %j", (email) => {
    expect(validarSolicitud({ ...base, email }).ok).toBe(true);
  });

  it("guarda teléfono y mensaje cuando vienen, y null cuando están vacíos", () => {
    const con = validarSolicitud({ ...base, telefono: " 600 11 22 33 ", mensaje: "  Juego desde niño  " });
    expect(con.ok && con.datos.telefono).toBe("600 11 22 33");
    expect(con.ok && con.datos.mensaje).toBe("Juego desde niño");

    const sin = validarSolicitud({ ...base, telefono: "   ", mensaje: "  " });
    expect(sin.ok && sin.datos.telefono).toBeNull();
    expect(sin.ok && sin.datos.mensaje).toBeNull();
  });

  it("conserva los saltos de línea del mensaje: la gente escribe párrafos", () => {
    const r = validarSolicitud({ ...base, mensaje: "Hola.\n\nJuego desde 2010." });
    expect(r.ok && r.datos.mensaje).toBe("Hola.\n\nJuego desde 2010.");
  });

  it("corta un mensaje kilométrico en vez de rechazarlo", () => {
    const r = validarSolicitud({ ...base, mensaje: "x".repeat(5000) });
    expect(r.ok).toBe(true);
    expect(r.ok && r.datos.mensaje?.length).toBe(1000);
  });
});
