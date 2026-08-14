import { describe, expect, it } from "vitest";
import {
  ALTURA_CAIDA,
  cabeElTablero,
  PLANO_FINAL,
  PLANO_INICIAL,
  PLANO_MEDIO,
  retrasoDeCaida,
  EASE_CAIDA,
  sePasaDelDestino,
} from "./coreografia";

describe("los tres planos del hero", () => {
  // Estos tests son la respuesta a cuatro iteraciones fallidas en las que el fallo se
  // descubrió mirando una captura. Aquí se descubre al guardar.

  it("el ARRANQUE es cerrado: el tablero NO cabe, que es la gracia", () => {
    // Si ya se viera todo, no habría nada que revelar al retroceder.
    expect(cabeElTablero(PLANO_INICIAL)).toBe(false);
  });

  it("en el plano MEDIO cabe el tablero entero", () => {
    // Es donde caen las piezas: si no cupiera, caerían fuera de cuadro.
    expect(cabeElTablero(PLANO_MEDIO)).toBe(true);
  });

  it("en el FINAL el tablero cabe ENTERO: no se corta la primera fila", () => {
    // Este test estuvo al revés durante una versión, y el cambio fue a propósito: se
    // probó que desbordara —para que hiciera de fondo hasta los bordes— y lo que pasaba
    // era que el borde de abajo serraba por la mitad la primera fila de piezas. Una fila
    // de piezas cortadas se lee como un fallo; un margen oscuro alrededor se lee como la
    // mesa. Gana verlo entero.
    expect(cabeElTablero(PLANO_FINAL)).toBe(true);
  });

  it("la cámara SUBE en cada acto: nunca se queda entre las piezas", () => {
    // El error de la versión anterior: la cámara acabó a la altura de las piezas y
    // salían gigantes y cortadas, tapando el título.
    expect(PLANO_MEDIO.posicion[1]).toBeGreaterThan(PLANO_INICIAL.posicion[1]);
    expect(PLANO_FINAL.posicion[1]).toBeGreaterThan(PLANO_MEDIO.posicion[1]);
  });

  it("la cámara se ALEJA del tablero en el segundo acto", () => {
    // Es literalmente lo que se pidió: "la cámara va hacia atrás".
    const dist = (p: typeof PLANO_INICIAL) =>
      Math.hypot(...p.posicion.map((v, i) => v - p.objetivo[i]));
    expect(dist(PLANO_MEDIO)).toBeGreaterThan(dist(PLANO_INICIAL));
  });

  it("el plano final mira desde ALTO pero en escorzo", () => {
    // Alto para que domine la planta del tablero, en escorzo para que las piezas se
    // vean de perfil: desde justo encima son círculos y no se distingue ninguna.
    const [x, y, z] = PLANO_FINAL.posicion;
    expect(y).toBeGreaterThan(Math.hypot(x, z)); // más alto que lejos: es vista alta
    expect(Math.hypot(x, z)).toBeGreaterThan(3); // pero no cenital pura
  });

  it("las piezas caen desde encima del tablero pero sin salirse de cuadro", () => {
    expect(ALTURA_CAIDA).toBeGreaterThan(3);
    expect(ALTURA_CAIDA).toBeLessThan(PLANO_MEDIO.posicion[1] + 4);
  });
});

describe("retrasoDeCaida", () => {
  it("las negras (filas 8 y 7) caen antes que las blancas", () => {
    expect(retrasoDeCaida(0, 8)).toBeLessThan(retrasoDeCaida(0, 1));
    expect(retrasoDeCaida(3, 7)).toBeLessThan(retrasoDeCaida(3, 2));
  });

  it("dentro de una fila, de los bordes al centro", () => {
    // La última en aterrizar queda cerca del centro, que es donde mejor se ve.
    expect(retrasoDeCaida(0, 8)).toBeLessThan(retrasoDeCaida(3, 8));
    expect(retrasoDeCaida(7, 8)).toBeLessThan(retrasoDeCaida(4, 8));
  });

  it("es simétrico: las dos esquinas de una fila caen a la vez", () => {
    expect(retrasoDeCaida(0, 8)).toBeCloseTo(retrasoDeCaida(7, 8), 6);
  });

  it("nadie espera más de tres segundos para empezar a caer", () => {
    // Con 32 piezas es fácil que la secuencia se haga eterna sin darse cuenta.
    for (const fila of [1, 2, 7, 8]) {
      for (let c = 0; c < 8; c++) {
        expect(retrasoDeCaida(c, fila)).toBeLessThan(3);
      }
    }
  });
});

describe("la curva de la caída", () => {
  it("la que se usa NO se pasa del destino", () => {
    // El fallo que costó una vuelta: `back.out` y `bounce.out` rebasan el valor final y
    // vuelven, y como el valor final es la superficie del tablero, eso son piezas
    // metiéndose dentro de la madera y saliendo después.
    expect(sePasaDelDestino(EASE_CAIDA)).toBe(false);
  });

  it("reconoce las familias que sí se pasan", () => {
    expect(sePasaDelDestino("back.out(1.15)")).toBe(true);
    expect(sePasaDelDestino("bounce.out")).toBe(true);
    expect(sePasaDelDestino("elastic.out(1, 0.3)")).toBe(true);
  });

  it("las que solo frenan valen", () => {
    for (const e of ["power2.out", "power3.out", "sine.out", "expo.out", "none"]) {
      expect(sePasaDelDestino(e)).toBe(false);
    }
  });
});
