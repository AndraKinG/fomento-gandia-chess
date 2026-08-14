import { describe, expect, it } from "vitest";
import { proyectar } from "./proyeccion";

describe("proyectar: la profundidad tiene que salir bien SIN mirar la pantalla", () => {
  // Esta es la razón de que este módulo exista: la versión con `rotateX` anidado salió
  // invertida cuatro veces seguidas y solo se detectaba recargando y midiendo píxeles.
  // Aquí es una cuenta, y una cuenta se prueba.

  it("la fila de delante se pinta MÁS GRANDE que la del fondo", () => {
    expect(proyectar(0, 1).escala).toBeGreaterThan(proyectar(0, 8).escala);
  });

  it("la fila de delante se pinta MÁS ABAJO que la del fondo", () => {
    expect(proyectar(0, 1).y).toBeGreaterThan(proyectar(0, 8).y);
  });

  it("cada fila hacia el fondo es menor que la anterior, sin saltos", () => {
    for (let fila = 1; fila < 8; fila++) {
      expect(proyectar(3, fila).escala).toBeGreaterThan(proyectar(3, fila + 1).escala);
      expect(proyectar(3, fila).y).toBeGreaterThan(proyectar(3, fila + 1).y);
    }
  });

  it("las columnas se estrechan hacia el fondo", () => {
    // El ancho del tablero en la fila 8 tiene que ser menor que en la 1: es lo que
    // dibuja el trapecio y lo que hace que se lea como una mesa.
    const anchoDelante = proyectar(7, 1).x - proyectar(0, 1).x;
    const anchoFondo = proyectar(7, 8).x - proyectar(0, 8).x;
    expect(anchoFondo).toBeLessThan(anchoDelante);
  });

  it("el tablero está centrado en las dos filas extremas", () => {
    const centro = (c: number, f: number) => (proyectar(0, f).x + proyectar(7, f).x) / 2;
    expect(centro(0, 1)).toBeCloseTo(50, 5);
    expect(centro(0, 8)).toBeCloseTo(50, 5);
  });

  it("las filas del fondo se apelotonan más que las de delante", () => {
    // La marca de que la perspectiva no es lineal: si las ocho filas estuvieran a la
    // misma distancia, el tablero parecería un mantel de cuadros hasta el horizonte.
    const separacionCerca = proyectar(0, 1).y - proyectar(0, 2).y;
    const separacionLejos = proyectar(0, 7).y - proyectar(0, 8).y;
    expect(separacionLejos).toBeLessThan(separacionCerca);
  });

  it("nada se sale del lienzo", () => {
    for (let fila = 1; fila <= 8; fila++) {
      for (let col = 0; col < 8; col++) {
        const p = proyectar(col, fila);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(100);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(100);
      }
    }
  });
});
