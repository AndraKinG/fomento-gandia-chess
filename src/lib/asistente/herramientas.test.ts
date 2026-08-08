import { describe, expect, it } from "vitest";
import { declaracionesPara, HERRAMIENTAS } from "./herramientas";

describe("declaracionesPara", () => {
  it("un socio no ve las herramientas de junta", () => {
    // Lo que el modelo no ve, no lo puede llamar ni mencionar.
    const nombres = declaracionesPara("jugador").map((d) => d.name);
    expect(nombres).not.toContain("solicitudes_de_alta");
  });

  it("la junta sí las ve", () => {
    expect(declaracionesPara("junta").map((d) => d.name)).toContain("solicitudes_de_alta");
  });

  it("el admin lo ve todo", () => {
    expect(declaracionesPara("admin")).toHaveLength(HERRAMIENTAS.length);
  });

  it("cada rango ve al menos lo del de abajo", () => {
    const jugador = declaracionesPara("jugador").map((d) => d.name);
    const junta = declaracionesPara("junta").map((d) => d.name);
    expect(junta).toEqual(expect.arrayContaining(jugador));
  });

  it("todas las herramientas declaran su rango", () => {
    // Sin rango, una herramienta nueva se colaría para todo el mundo por olvido.
    for (const h of HERRAMIENTAS) {
      expect(["jugador", "junta", "admin"]).toContain(h.rango);
    }
  });

  it("lo que se le manda a la API NO lleva nuestro campo de rango", () => {
    // Gemini contesta 400 y se queda sin responder si le llega un campo que no
    // conoce. Pasó en la primera versión.
    for (const d of declaracionesPara("admin")) {
      expect(d).not.toHaveProperty("rango");
    }
  });

  it("las de datos propios del club son para cualquier socio", () => {
    const nombres = declaracionesPara("jugador").map((d) => d.name);
    expect(nombres).toContain("mi_ficha");
    expect(nombres).toContain("orden_de_fuerza");
    expect(nombres).toContain("buscar_partidas");
  });
});
