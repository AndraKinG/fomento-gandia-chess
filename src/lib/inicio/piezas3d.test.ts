import { describe, expect, it } from "vitest";
import { alturaDe, PERFILES, tipoDeSprite, type TipoPieza } from "./piezas3d";

const TIPOS: TipoPieza[] = ["P", "R", "B", "Q", "K"];

describe("perfiles de las piezas", () => {
  // Estos tests existen porque unas coordenadas mal puestas no fallan: dan una pieza
  // hundida en el tablero, del revés o con la cintura más ancha que la base, y eso solo
  // se descubre mirando una captura. Aquí se descubre al guardar.

  it("todas empiezan en el eje y a ras de tablero", () => {
    // El primer punto tiene que ser el centro de la base: si el radio no fuera 0, la
    // pieza saldría con un agujero por debajo.
    for (const tipo of TIPOS) {
      expect(PERFILES[tipo][0]).toEqual({ radio: 0, altura: 0 });
    }
  });

  it("todas acaban en el eje: la punta se cierra", () => {
    for (const tipo of TIPOS) {
      expect(PERFILES[tipo].at(-1)!.radio).toBe(0);
    }
  });

  it("la altura solo sube, nunca baja", () => {
    // Un perfil que retrocede en altura se pliega sobre sí mismo y sale una pieza con
    // las caras cruzadas.
    for (const tipo of TIPOS) {
      const alturas = PERFILES[tipo].map((p) => p.altura);
      for (let i = 1; i < alturas.length; i++) {
        expect(alturas[i]).toBeGreaterThanOrEqual(alturas[i - 1]);
      }
    }
  });

  it("ningún radio es negativo", () => {
    for (const tipo of TIPOS) {
      for (const p of PERFILES[tipo]) expect(p.radio).toBeGreaterThanOrEqual(0);
    }
  });

  it("ninguna pieza es más ancha que su casilla", () => {
    // Radio máximo 0,5 sería tocar el borde. Por encima de eso, las piezas de casillas
    // vecinas se atravesarían.
    for (const tipo of TIPOS) {
      const maximo = Math.max(...PERFILES[tipo].map((p) => p.radio));
      expect(maximo).toBeLessThan(0.42);
    }
  });

  it("la base es la parte más ancha", () => {
    // Como en un juego de verdad: si la cintura fuera más ancha que la base, la pieza
    // se vería inestable y además se tocarían entre ellas antes que los pies.
    for (const tipo of TIPOS) {
      const radioBase = Math.max(
        ...PERFILES[tipo].filter((p) => p.altura <= 0.06).map((p) => p.radio)
      );
      const radioArriba = Math.max(
        ...PERFILES[tipo].filter((p) => p.altura > 0.06).map((p) => p.radio)
      );
      expect(radioBase).toBeGreaterThan(radioArriba);
    }
  });

  it("la jerarquía de alturas es la de un juego de ajedrez", () => {
    // Es lo que deja distinguirlas desde arriba, que es donde acaba la animación.
    expect(alturaDe("P")).toBeLessThan(alturaDe("R"));
    expect(alturaDe("R")).toBeLessThan(alturaDe("B"));
    expect(alturaDe("B")).toBeLessThan(alturaDe("Q"));
    expect(alturaDe("Q")).toBeLessThan(alturaDe("K"));
  });

  it("ninguna pieza es más alta que dos casillas", () => {
    for (const tipo of TIPOS) expect(alturaDe(tipo)).toBeLessThan(2);
  });
});

describe("tipoDeSprite", () => {
  it("saca la letra del sprite", () => {
    expect(tipoDeSprite("wQ")).toBe("Q");
    expect(tipoDeSprite("bP")).toBe("P");
  });

  it("el caballo se distingue, porque ese no se puede tornear", () => {
    expect(tipoDeSprite("wN")).toBe("N");
  });
});
