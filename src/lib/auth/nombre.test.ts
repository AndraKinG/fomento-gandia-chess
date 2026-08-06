import { describe, expect, it } from "vitest";
import { nombreDePila } from "./nombre";

describe("nombreDePila", () => {
  it("saca el nombre del formato de la FACV, que va con coma", () => {
    expect(nombreDePila("Martínez Ribes, Joan")).toBe("Joan");
  });

  it("saca el nombre del formato normal, sin coma", () => {
    expect(nombreDePila("Joan Martínez Ribes")).toBe("Joan");
  });

  it("se queda con el primer nombre cuando hay dos", () => {
    expect(nombreDePila("Pérez Gómez, José Luis")).toBe("José");
    expect(nombreDePila("José Luis Pérez Gómez")).toBe("José");
  });

  it("aguanta espacios de sobra alrededor de la coma", () => {
    expect(nombreDePila("Aalbersberg ,   Vincent  ")).toBe("Vincent");
  });

  it("devuelve null cuando no hay ficha o el nombre está vacío", () => {
    expect(nombreDePila(null)).toBeNull();
    expect(nombreDePila(undefined)).toBeNull();
    expect(nombreDePila("")).toBeNull();
    expect(nombreDePila("   ")).toBeNull();
  });

  it("no se rompe con una coma sin nada detrás", () => {
    // Un dato así está mal escrito, pero no debe dejar la pantalla sin saludo ni
    // reventarla: se prefiere quedarse sin nombre.
    expect(nombreDePila("Solo Apellidos,")).toBeNull();
  });

  it("un nombre de una sola palabra se devuelve tal cual", () => {
    expect(nombreDePila("Joan")).toBe("Joan");
  });
});
