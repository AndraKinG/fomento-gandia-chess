import { describe, expect, it } from "vitest";
import {
  ALTURA_CAIDA,
  cabeElTablero,
  PLANO_CENITAL,
  PLANO_INICIAL,
  PLANO_MEDIO,
  retrasoDeCaida,
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

  it("en el CENITAL también cabe", () => {
    expect(cabeElTablero(PLANO_CENITAL)).toBe(true);
  });

  it("la cámara SUBE en cada acto: nunca se queda entre las piezas", () => {
    // El error de la versión anterior: la cámara acabó a la altura de las piezas y
    // salían gigantes y cortadas, tapando el título.
    expect(PLANO_MEDIO.posicion[1]).toBeGreaterThan(PLANO_INICIAL.posicion[1]);
    expect(PLANO_CENITAL.posicion[1]).toBeGreaterThan(PLANO_MEDIO.posicion[1]);
  });

  it("la cámara se ALEJA del tablero en el segundo acto", () => {
    // Es literalmente lo que se pidió: "la cámara va hacia atrás".
    const dist = (p: typeof PLANO_INICIAL) =>
      Math.hypot(...p.posicion.map((v, i) => v - p.objetivo[i]));
    expect(dist(PLANO_MEDIO)).toBeGreaterThan(dist(PLANO_INICIAL));
  });

  it("el cenital mira casi recto hacia abajo", () => {
    // Casi, no del todo: de canto exacto las piezas no se distinguirían.
    const [x, , z] = PLANO_CENITAL.posicion;
    expect(Math.hypot(x, z)).toBeLessThan(2);
    expect(PLANO_CENITAL.posicion[1]).toBeGreaterThan(10);
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
