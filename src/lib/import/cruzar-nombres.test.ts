import { describe, expect, it } from "vitest";
import { buscarFicha, claveNombre, indicePorNombre } from "./cruzar-nombres";

describe("claveNombre", () => {
  it("da la misma clave con los dos formatos reales de la base", () => {
    // Los dos existen en `players.nombre`: el de la FACV y el metido a mano.
    expect(claveNombre("Gregori Olivares, Borja")).toBe(
      claveNombre("Borja Gregori Olivares")
    );
  });

  it("ignora los acentos, que el acta no lleva", () => {
    expect(claveNombre("Boronat Castello, Alvaro")).toBe(
      claveNombre("Álvaro Boronat Castelló")
    );
    expect(claveNombre("Escriva Hernandez, Aaron")).toBe(
      claveNombre("Aarón Escrivá Hernández")
    );
  });

  it("ignora mayúsculas, comas y espacios de sobra", () => {
    expect(claveNombre("  SEGUI   PASTOR ,  Rafael ")).toBe(
      claveNombre("Rafael Segui Pastor")
    );
  });

  it("aguanta nombres compuestos", () => {
    expect(claveNombre("Sabater Santonja, Juan Jose")).toBe(
      claveNombre("Juan Jose Sabater Santonja")
    );
  });

  it("dos personas distintas no comparten clave", () => {
    expect(claveNombre("Delord, Tristan")).not.toBe(claveNombre("Delord, Raphael"));
  });

  it("un nombre que le falta una palabra NO cuadra", () => {
    // Preferimos no enlazar antes que enlazar de más.
    expect(claveNombre("Gregori, Borja")).not.toBe(
      claveNombre("Borja Gregori Olivares")
    );
  });

  it("ignora el año de nacimiento que el acta añade a los homónimos", () => {
    // Real: chess-results escribe "Gonzalez Rodriguez, Manuel 1969" cuando hay dos
    // jugadores con el mismo nombre en el grupo.
    expect(claveNombre("Gonzalez Rodriguez, Manuel 1969")).toBe(
      claveNombre("Manuel González Rodríguez")
    );
  });

  it("no se carga un número que no parece un año", () => {
    expect(claveNombre("Perez, Juan 3")).toContain("3");
  });

  it("un nombre vacío da clave vacía", () => {
    expect(claveNombre("   ")).toBe("");
  });
});

describe("indicePorNombre y buscarFicha", () => {
  const fichas = [
    { id: "f1", nombre: "Gregori Olivares, Borja" },
    { id: "f2", nombre: "Álvaro Boronat Castelló" },
    { id: "f3", nombre: "Delord, Tristan" },
  ];
  const indice = indicePorNombre(fichas);

  it("encuentra la ficha viniendo del formato del acta", () => {
    expect(buscarFicha("Boronat Castello, Alvaro", indice)).toBe("f2");
  });

  it("encuentra la ficha viniendo del formato de la app", () => {
    expect(buscarFicha("Borja Gregori Olivares", indice)).toBe("f1");
  });

  it("devuelve null para alguien que no es del club", () => {
    expect(buscarFicha("Efimovich, Sergey", indice)).toBeNull();
  });

  it("devuelve null con un nombre vacío", () => {
    expect(buscarFicha("", indice)).toBeNull();
  });

  it("si dos fichas dan la misma clave, NINGUNA se enlaza", () => {
    // Es la protección que evita colgarle una partida al socio equivocado.
    const conDuplicado = indicePorNombre([
      { id: "a", nombre: "Perez Gomez, Juan" },
      { id: "b", nombre: "Juan Perez Gomez" },
      { id: "c", nombre: "Delord, Tristan" },
    ]);
    expect(buscarFicha("Perez Gomez, Juan", conDuplicado)).toBeNull();
    // Y el resto del índice sigue funcionando.
    expect(buscarFicha("Delord, Tristan", conDuplicado)).toBe("c");
  });

  it("los nombres vacíos no ensucian el índice", () => {
    const conVacio = indicePorNombre([
      { id: "a", nombre: "   " },
      { id: "b", nombre: "  " },
      { id: "c", nombre: "Delord, Tristan" },
    ]);
    expect(buscarFicha("Delord, Tristan", conVacio)).toBe("c");
  });
});
