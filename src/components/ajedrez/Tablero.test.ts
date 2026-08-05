import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { casillaDe } from "./Tablero";

/**
 * `casillaDe` traduce los índices de la CUADRÍCULA PINTADA a casilla algebraica.
 * Es el sitio donde un error pasa desapercibido en la revisión y se nota como
 * "las piezas están mal colocadas", así que conviene fijarlo con tests.
 *
 * El tablero, cuando está volteado, invierte filas y columnas antes de pintar, y
 * esta función tiene que deshacer esa inversión.
 */
describe("casillaDe sin voltear (vista de las blancas)", () => {
  it.each([
    [0, 0, "a8"],
    [0, 7, "h8"],
    [7, 0, "a1"],
    [7, 7, "h1"],
    [4, 4, "e4"],
  ])("fila %i columna %i → %s", (f, c, esperado) => {
    expect(casillaDe(f, c, false)).toBe(esperado);
  });
});

describe("casillaDe volteado (vista de las negras)", () => {
  it.each([
    [0, 0, "h1"],
    [0, 7, "a1"],
    [7, 0, "h8"],
    [7, 7, "a8"],
  ])("fila %i columna %i → %s", (f, c, esperado) => {
    expect(casillaDe(f, c, true)).toBe(esperado);
  });
});

describe("coherencia con la posición que pinta el tablero", () => {
  /** Réplica exacta de la inversión que hace el componente al voltear. */
  const ordenar = (filas: unknown[][], volteado: boolean) =>
    volteado ? [...filas].reverse().map((f) => [...f].reverse()) : filas;

  it("sin voltear, cada pieza cae en su casilla real", () => {
    const c = new Chess();
    const filas = c.board();
    const orden = ordenar(filas, false) as ReturnType<Chess["board"]>;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const celda = orden[i][j];
        if (celda) expect(casillaDe(i, j, false)).toBe(celda.square);
      }
    }
  });

  it("volteado, cada pieza cae en su casilla real", () => {
    const c = new Chess();
    const orden = ordenar(c.board(), true) as ReturnType<Chess["board"]>;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const celda = orden[i][j];
        if (celda) expect(casillaDe(i, j, true)).toBe(celda.square);
      }
    }
  });

  it("volteado, la esquina de arriba a la izquierda es h1", () => {
    // Comprobación de sentido: desde las negras, arriba-izquierda es h1.
    const c = new Chess();
    const orden = ordenar(c.board(), true) as ReturnType<Chess["board"]>;
    expect(orden[0][0]?.square).toBe("h1");
    expect(casillaDe(0, 0, true)).toBe("h1");
  });
});

describe("el PGN que genera el editor a partir de las jugadas", () => {
  it("una secuencia de SAN produce un PGN reproducible", () => {
    // Es el flujo del editor: guarda los SAN y reconstruye para sacar el PGN.
    const jugadas = ["e4", "e5", "Nf3", "Nc6", "Bb5"];
    const c = new Chess();
    for (const j of jugadas) c.move(j);
    const pgn = c.pgn();

    const releido = new Chess();
    releido.loadPgn(pgn);
    expect(releido.history()).toEqual(jugadas);
  });

  it("mantiene la notación de un enroque y de una coronación", () => {
    const c = new Chess();
    for (const j of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]) c.move(j);
    expect(c.pgn()).toContain("O-O");

    const p = new Chess("8/P7/8/8/8/8/8/K6k w - - 0 1");
    const m = p.move({ from: "a7", to: "a8", promotion: "q" });
    expect(m.san).toBe("a8=Q+");
  });

  it("sin jugadas no hay partida que guardar", () => {
    expect(new Chess().history()).toHaveLength(0);
  });
});
