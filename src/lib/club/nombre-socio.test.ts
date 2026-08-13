import { describe, expect, it } from "vitest";
import { nombreDeFila, nombreVisible } from "./nombre-socio";

describe("nombreVisible", () => {
  it("el mote manda cuando lo hay", () => {
    expect(nombreVisible({ nombre: "Almiñana Almiñana, Joaquim", apodo: "Ximo" })).toBe(
      "Ximo"
    );
  });

  it("sin mote, el nombre oficial", () => {
    expect(nombreVisible({ nombre: "Gadea Martí, Rafael Nicolás", apodo: null })).toBe(
      "Gadea Martí, Rafael Nicolás"
    );
  });

  it("una pantalla que todavía no pide la columna sigue funcionando", () => {
    // `apodo` undefined es el caso de una consulta vieja que solo selecciona `nombre`:
    // tiene que caer al oficial, que es lo que se veía antes de existir los motes, en
    // vez de dejar el hueco en blanco.
    expect(nombreVisible({ nombre: "Juan Vicente Sanfélix" })).toBe(
      "Juan Vicente Sanfélix"
    );
  });

  it("espacios en blanco NO son un mote", () => {
    expect(nombreVisible({ nombre: "Luis Vallalta", apodo: "   " })).toBe("Luis Vallalta");
  });

  it("el mote se recorta", () => {
    expect(nombreVisible({ nombre: "Luis Vallalta", apodo: "  Luisico " })).toBe("Luisico");
  });

  it("sin socio no revienta la pantalla", () => {
    // Los embeds de PostgREST dan null cuando la relación no trae fila.
    expect(nombreVisible(null)).toBe("Socio");
    expect(nombreVisible(undefined)).toBe("Socio");
  });
});

describe("nombreDeFila", () => {
  it("lee una fila cruda del embed", () => {
    expect(nombreDeFila({ nombre: "Ximo Almiñana", apodo: "Ximo" })).toBe("Ximo");
    expect(nombreDeFila(null)).toBe("Socio");
  });
});
