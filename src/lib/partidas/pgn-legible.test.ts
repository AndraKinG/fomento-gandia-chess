import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { comentariosJuntos, paraReproducir, sinVariantes } from "./pgn-legible";

/**
 * El trozo REAL que lo destapó: un capítulo de estudio de Lichess con la evaluación y
 * el texto del análisis en DOS comentarios seguidos, y variantes detrás.
 */
const LICHESS = `[Event "AndraKinG's Study: Partida 2 Interclubs 2026 (Ronda 5) Joan"]
[Date "2026.02.07"]
[Result "*"]

1. d4 { [%eval 0.15] } 1... d5 { [%eval 0.27] } 2. Bf4 { [%eval 0.0] } 2... e6 { [%eval 0.1] } 3. Nf3 { [%eval 0.12] } 3... Nf6 { [%eval 0.1] } 4. e3 { [%eval 0.0] } 4... c5 { [%eval 0.14] } 5. c3 { [%eval 0.0] } 5... c4 { [%eval 0.47] } 6. Nbd2 { [%eval 0.15] } 6... Bd6 { [%eval 0.63] } 7. Ne5?! { [%eval 0.0] } { Inaccuracy. Bxd6 was best. } (7. Bxd6 Qxd6 8. e4 dxe4 9. Nxc4 Qe7 10. Nfd2 b5 11. Ne3 a6) 7... Bxe5? { [%eval 1.42] } { Mistake. Qc7 was best. } (7... Qc7 8. b3 Nc6 9. bxc4 Nxe5 10. c5 Nd3+ 11. Bxd3 Bxf4 12. exf4) 8. Bxe5?! { [%eval 0.43] } 8... O-O { [%eval 0.65] } *`;

describe("el PGN de Lichess se puede reproducir", () => {
  it("chess.js NO puede con el original: por eso existe este módulo", () => {
    // Deja constancia de la causa. Si algún día chess.js lo acepta, este test falla y
    // avisa de que la limpieza ya no hace falta.
    expect(() => new Chess().loadPgn(LICHESS)).toThrow();
  });

  it("limpiado, se lee entero", () => {
    const c = new Chess();
    c.loadPgn(paraReproducir(LICHESS));
    expect(c.history()).toHaveLength(16);
    expect(c.history().at(-1)).toBe("O-O");
  });

  it("las jugadas son las de la línea principal, no las de una variante", () => {
    // El error que estaría feo: colar `Bxd6` de la variante en la partida de verdad.
    const c = new Chess();
    c.loadPgn(paraReproducir(LICHESS));
    expect(c.history()).toEqual([
      "d4", "d5", "Bf4", "e6", "Nf3", "Nf6", "e3", "c5",
      "c3", "c4", "Nbd2", "Bd6", "Ne5", "Bxe5", "Bxe5", "O-O",
    ]);
  });

  it("no toca las cabeceras", () => {
    expect(paraReproducir(LICHESS)).toContain('[Event "AndraKinG\'s Study');
  });
});

describe("sinVariantes", () => {
  it("quita una variante simple", () => {
    expect(sinVariantes("1. d4 (1. e4 e5) 1... d5").replace(/\s+/g, " ").trim()).toBe(
      "1. d4 1... d5"
    );
  });

  it("quita las variantes ANIDADAS, que una expresión regular no puede", () => {
    // Con `\(...\)` la de dentro se queda suelta y sus jugadas acaban metidas en la
    // partida principal, que es peor que no leerla.
    const r = sinVariantes("1. d4 (1. e4 e5 (1... c5 2. Nf3) 2. d4) 1... d5");
    expect(r).not.toContain("c5");
    expect(r).not.toContain("Nf3");
    expect(r.replace(/\s+/g, " ").trim()).toBe("1. d4 1... d5");
  });

  it("un paréntesis DENTRO de un comentario no abre variante", () => {
    // En un texto de análisis puede haber un "(mejor)" que no es una variante.
    const r = sinVariantes("1. d4 { esto es mejor (y mucho) } 1... d5");
    expect(r).toContain("(y mucho)");
    expect(r).toContain("1... d5");
  });
});

describe("comentariosJuntos", () => {
  it("dos comentarios seguidos se juntan en uno, sin perder texto", () => {
    expect(comentariosJuntos("1. d4 { [%eval 0.1] } { Inaccuracy. } 1... d5")).toBe(
      "1. d4 { [%eval 0.1] Inaccuracy. } 1... d5"
    );
  });

  it("tres seguidos también", () => {
    const r = comentariosJuntos("1. d4 { a } { b } { c } 1... d5");
    expect(r).toBe("1. d4 { a b c } 1... d5");
  });

  it("un comentario solo se queda como está", () => {
    expect(comentariosJuntos("1. d4 { a } 1... d5")).toBe("1. d4 { a } 1... d5");
  });
});
