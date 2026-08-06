import { describe, expect, it } from "vitest";
import { calcularMarcador, formatearPunto, marcadorPreferido } from "./marcador";

describe("formatearPunto", () => {
  it.each([
    [0, "0"],
    [0.5, "½"],
    [1, "1"],
    [1.5, "1½"],
    [4, "4"],
    [4.5, "4½"],
    [8, "8"],
  ])("formatearPunto(%s) → %s", (n, esperado) => {
    expect(formatearPunto(n)).toBe(esperado);
  });
});

describe("calcularMarcador", () => {
  it("sin resultados aún: 0 – 0, completos 0", () => {
    const m = calcularMarcador([], 8);
    expect(m).toEqual({ nuestro: 0, rival: 0, completos: 0, total: 8, texto: "0 – 0" });
  });

  it("parcial: 3 tableros anotados (1, 0.5, 0) de 8", () => {
    const m = calcularMarcador([1, 0.5, 0], 8);
    expect(m.nuestro).toBe(1.5);
    expect(m.rival).toBe(1.5);
    expect(m.completos).toBe(3);
    expect(m.total).toBe(8);
    expect(m.texto).toBe("1½ – 1½");
  });

  it("completo, victoria clara: 4½ – 3½ (8 tableros)", () => {
    const resultados = [1, 1, 1, 1, 0.5, 0, 0, 0];
    const m = calcularMarcador(resultados, 8);
    expect(m.nuestro).toBe(4.5);
    expect(m.rival).toBe(3.5);
    expect(m.completos).toBe(8);
    expect(m.texto).toBe("4½ – 3½");
  });

  it("completo, derrota: 0 – 8 (nuestro resultado siempre primero)", () => {
    const resultados = new Array(8).fill(0);
    const m = calcularMarcador(resultados, 8);
    expect(m.texto).toBe("0 – 8");
  });
});

// Revisión final 1C, item 3: precedencia compartida entre `/club/equipos/[id]`
// (detalle de equipo, lista de jornadas) y `/club/jornadas/[matchId]` (detalle de
// jornada) — antes cada pantalla decidía la precedencia por su cuenta y la
// de `/club/equipos/[id]` estaba INVERTIDA (prefería el marcador global de la
// sync FACV incluso cuando el capitán ya tenía resultados por tablero más
// fiables/actuales). La regla correcta es "boards del capitán primero":
// mientras haya AL MENOS un tablero anotado, ese es el marcador a mostrar
// (aunque esté incompleto); el marcador de FACV solo se usa como fallback
// cuando no hay ningún resultado por tablero todavía.
describe("marcadorPreferido", () => {
  it("con resultados por tablero (aunque incompletos) y marcador FACV disponible: gana el de tableros", () => {
    const boardsMarcador = calcularMarcador([1, 0.5], 8);
    const resultado = marcadorPreferido({
      boardsMarcador,
      marcadorPropio: 4.5,
      marcadorRival: 3.5,
    });
    expect(resultado).toEqual({ texto: boardsMarcador.texto, parcial: true, fuente: "tableros" });
  });

  it("con resultados por tablero COMPLETOS: gana el de tableros, parcial=false", () => {
    const boardsMarcador = calcularMarcador([1, 1, 0.5, 0, 1, 0.5, 0, 0.5], 8);
    const resultado = marcadorPreferido({
      boardsMarcador,
      marcadorPropio: 4.5,
      marcadorRival: 3.5,
    });
    expect(resultado).toEqual({ texto: "4½ – 3½", parcial: false, fuente: "tableros" });
  });

  it("sin ningún resultado por tablero: cae al marcador FACV", () => {
    const boardsMarcador = calcularMarcador([], 8);
    const resultado = marcadorPreferido({
      boardsMarcador,
      marcadorPropio: 4.5,
      marcadorRival: 3.5,
    });
    expect(resultado).toEqual({ texto: "4½ – 3½", parcial: false, fuente: "facv" });
  });

  it("sin boardsMarcador (no hay convocatoria) y sin marcador FACV: null", () => {
    expect(marcadorPreferido({ marcadorPropio: null, marcadorRival: null })).toBeNull();
  });

  it("sin boardsMarcador (no hay convocatoria) pero con marcador FACV: usa el de FACV", () => {
    const resultado = marcadorPreferido({ marcadorPropio: 4.5, marcadorRival: 3.5 });
    expect(resultado).toEqual({ texto: "4½ – 3½", parcial: false, fuente: "facv" });
  });

  it("marcador FACV solo parcialmente presente (uno de los dos null): se ignora, resultado null", () => {
    const boardsMarcador = calcularMarcador([], 8);
    expect(marcadorPreferido({ boardsMarcador, marcadorPropio: 4.5, marcadorRival: null })).toBeNull();
  });
});

describe("marcadorPreferido con el acta oficial en medio", () => {
  const boards = calcularMarcador([1, 0.5], 8);
  const acta = calcularMarcador([1, 1, 1, 0.5, 0, 0, 0, 0], 8);

  it("los tableros del capitán siguen mandando sobre el acta", () => {
    const r = marcadorPreferido({
      boardsMarcador: boards,
      actaMarcador: acta,
      marcadorPropio: 5,
      marcadorRival: 3,
    });
    expect(r?.fuente).toBe("tableros");
  });

  it("sin tableros del capitán manda el acta, no el marcador global", () => {
    const r = marcadorPreferido({
      boardsMarcador: null,
      actaMarcador: acta,
      marcadorPropio: 5,
      marcadorRival: 3,
    });
    expect(r?.fuente).toBe("acta");
    expect(r?.texto).toBe("3½ – 4½");
    expect(r?.parcial).toBe(false);
  });

  it("un acta a medias se marca como parcial", () => {
    const r = marcadorPreferido({ actaMarcador: calcularMarcador([1, 1], 8) });
    expect(r?.fuente).toBe("acta");
    expect(r?.parcial).toBe(true);
  });

  it("un acta sin ningún resultado no cuenta: se cae al marcador global", () => {
    const r = marcadorPreferido({
      actaMarcador: calcularMarcador([], 8),
      marcadorPropio: 5,
      marcadorRival: 3,
    });
    expect(r?.fuente).toBe("facv");
  });

  it("ESTE es el caso que dejaba jornadas sin marcador", () => {
    // Convocatoria borrada y `marcador_propio` nunca escrito por la sync (no lo
    // escribe cuando hay tableros del capitán). Antes devolvía null y la fila
    // aparecía sin marcador; ahora responde el acta.
    const r = marcadorPreferido({
      boardsMarcador: null,
      actaMarcador: acta,
      marcadorPropio: null,
      marcadorRival: null,
    });
    expect(r).not.toBeNull();
    expect(r?.fuente).toBe("acta");
  });

  it("sin ninguna de las tres fuentes sigue devolviendo null", () => {
    expect(marcadorPreferido({})).toBeNull();
  });
});
