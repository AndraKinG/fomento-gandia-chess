import { describe, expect, it } from "vitest";
import {
  aPartidaImportada,
  aPgnExportable,
  fechaDePgn,
  leerCabeceras,
  normalizar,
  quitarCabeceras,
  separarPartidas,
} from "./pgn";

// PGN real de Lichess (dos partidas), con el formato que descarga de verdad:
// cabeceras, línea en blanco, jugadas con reloj entre llaves.
const LICHESS = `[Event "Rated blitz game"]
[Site "https://lichess.org/abc123"]
[Date "2026.03.14"]
[White "joanribes"]
[Black "rival_uno"]
[Result "1-0"]
[UTCDate "2026.03.14"]
[WhiteElo "1780"]
[BlackElo "1802"]

1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Nf3 Nc6 3. Bb5 1-0

[Event "Rated blitz game"]
[Site "https://lichess.org/def456"]
[Date "2026.03.15"]
[White "rival_dos"]
[Black "joanribes"]
[Result "0-1"]
[WhiteElo "1850"]
[BlackElo "1785"]

1. d4 d5 2. c4 e6 0-1`;

describe("separarPartidas", () => {
  it("separa las dos partidas de un PGN de Lichess", () => {
    const partidas = separarPartidas(LICHESS);
    expect(partidas).toHaveLength(2);
    expect(partidas[0]).toContain("abc123");
    expect(partidas[1]).toContain("def456");
  });

  it("no parte por la línea en blanco que hay dentro de cada partida", () => {
    const partidas = separarPartidas(LICHESS);
    // Cada trozo tiene que llevarse sus cabeceras Y sus jugadas.
    expect(partidas[0]).toContain("[White ");
    expect(partidas[0]).toContain("1. e4");
  });

  it("una sola partida devuelve un solo trozo", () => {
    const una = separarPartidas('[Event "X"]\n\n1. e4 e5 1-0');
    expect(una).toHaveLength(1);
  });

  it("aguanta finales de línea de Windows", () => {
    expect(separarPartidas(LICHESS.replace(/\n/g, "\r\n"))).toHaveLength(2);
  });

  it("texto vacío o en blanco no da partidas", () => {
    expect(separarPartidas("")).toEqual([]);
    expect(separarPartidas("   \n\n  ")).toEqual([]);
  });

  it("un PGN sin cabeceras cuenta como una partida", () => {
    expect(separarPartidas("1. e4 e5 2. Nf3 1-0")).toHaveLength(1);
  });
});

describe("leerCabeceras", () => {
  it("lee las cabeceras de la primera partida", () => {
    const c = leerCabeceras(separarPartidas(LICHESS)[0]);
    expect(c.White).toBe("joanribes");
    expect(c.BlackElo).toBe("1802");
    expect(c.Result).toBe("1-0");
  });

  it("sin cabeceras devuelve objeto vacío", () => {
    expect(leerCabeceras("1. e4 e5")).toEqual({});
  });
});

describe("fechaDePgn", () => {
  it.each([
    ["2026.03.14", "2026-03-14"],
    ["2026-03-14", "2026-03-14"],
    ["2026.??.??", null],
    ["", null],
    [undefined, null],
    ["14.03.2026", null],
  ])("fechaDePgn(%j) → %j", (entrada, esperado) => {
    expect(fechaDePgn(entrada)).toBe(esperado);
  });
});

describe("normalizar nombres para reconocer al jugador", () => {
  it("ignora acentos, mayúsculas y separadores", () => {
    expect(normalizar("Pérez_García, Luis")).toBe("perezgarcialuis");
    expect(normalizar("PEREZ GARCIA LUIS")).toBe("perezgarcialuis");
  });
});

describe("aPartidaImportada", () => {
  const [uno, dos] = separarPartidas(LICHESS);

  it("reconoce que el usuario llevaba blancas y ganó", () => {
    const p = aPartidaImportada(uno, ["joanribes"]);
    expect(p.reconocida).toBe(true);
    expect(p.color).toBe("blancas");
    expect(p.resultado).toBe("1");
    expect(p.rivalNombre).toBe("rival_uno");
    expect(p.rivalElo).toBe(1802);
    expect(p.miElo).toBe(1780);
    expect(p.fecha).toBe("2026-03-14");
  });

  it("da la vuelta al resultado cuando el usuario llevaba negras", () => {
    // El PGN dice "0-1" (ganan negras) y el usuario ERA negras: para él es 1.
    const p = aPartidaImportada(dos, ["joanribes"]);
    expect(p.color).toBe("negras");
    expect(p.resultado).toBe("1");
    expect(p.rivalNombre).toBe("rival_dos");
    expect(p.rivalElo).toBe(1850);
  });

  it("las tablas son tablas para los dos", () => {
    const tablas = '[White "joanribes"]\n[Black "otro"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2';
    expect(aPartidaImportada(tablas, ["joanribes"]).resultado).toBe("0.5");
  });

  it("reconoce al jugador por cualquiera de sus nombres o usuarios", () => {
    const p = aPartidaImportada(uno, ["Martínez Ribes, Joan", "joanribes", "joanchess"]);
    expect(p.reconocida).toBe(true);
  });

  it("NO adivina cuando el usuario no aparece en la partida", () => {
    const p = aPartidaImportada(uno, ["otra_persona"]);
    expect(p.reconocida).toBe(false);
    expect(p.color).toBeNull();
    expect(p.resultado).toBeNull();
    expect(p.rivalNombre).toBeNull();
  });

  it("NO adivina si coincide con los dos bandos", () => {
    // Un nombre tan corto que casa con blanco y negro: mejor preguntar.
    const ambiguo = '[White "ana"]\n[Black "anabel"]\n[Result "1-0"]\n\n1. e4 1-0';
    expect(aPartidaImportada(ambiguo, ["ana"]).reconocida).toBe(false);
  });

  it("descarta el Event de relleno de las plataformas", () => {
    // "Rated blitz game" no es un torneo, es el relleno de Lichess.
    expect(aPartidaImportada(uno, ["joanribes"]).torneoTexto).toBeNull();
  });

  it("conserva el Event cuando sí es un torneo", () => {
    const conTorneo = '[Event "Open Albal 2026"]\n[White "joanribes"]\n[Black "x"]\n[Result "1-0"]\n[Round "3"]\n\n1. e4 1-0';
    const p = aPartidaImportada(conTorneo, ["joanribes"]);
    expect(p.torneoTexto).toBe("Open Albal 2026");
    expect(p.ronda).toBe(3);
  });

  it("ignora una ronda no numérica como '?'", () => {
    const p = aPartidaImportada('[White "a"]\n[Black "b"]\n[Round "?"]\n\n1. e4', ["a"]);
    expect(p.ronda).toBeNull();
  });
});

describe("quitarCabeceras", () => {
  it("deja solo las jugadas", () => {
    expect(quitarCabeceras(separarPartidas(LICHESS)[1])).toBe("1. d4 d5 2. c4 e6 0-1");
  });
});

describe("aPgnExportable", () => {
  const base = {
    fecha: "2026-03-14",
    ronda: 3,
    duenio: "Martínez Ribes, Joan",
    rivalNombre: "Pérez, Luis",
    miElo: 1780,
    rivalElo: 1802,
    torneo: "Open Albal",
    pgn: '[Event "viejo"]\n\n1. e4 e5 1-0',
  };

  it("pone al dueño en el bando que le toca y traduce el resultado", () => {
    const pgn = aPgnExportable([{ ...base, color: "blancas", resultado: "1" }]);
    expect(pgn).toContain('[White "Martínez Ribes, Joan"]');
    expect(pgn).toContain('[Black "Pérez, Luis"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[WhiteElo "1780"]');
  });

  it("con el dueño de negras, ganar él es 0-1", () => {
    const pgn = aPgnExportable([{ ...base, color: "negras", resultado: "1" }]);
    expect(pgn).toContain('[White "Pérez, Luis"]');
    expect(pgn).toContain('[Black "Martínez Ribes, Joan"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[WhiteElo "1802"]');
  });

  it("las tablas se escriben 1/2-1/2 sea cual sea el color", () => {
    for (const color of ["blancas", "negras"]) {
      const pgn = aPgnExportable([{ ...base, color, resultado: "0.5" }]);
      expect(pgn).toContain('[Result "1/2-1/2"]');
    }
  });

  it("reescribe las cabeceras: no arrastra las del PGN original", () => {
    const pgn = aPgnExportable([{ ...base, color: "blancas", resultado: "1" }]);
    expect(pgn).not.toContain('[Event "viejo"]');
    expect(pgn).toContain('[Event "Open Albal"]');
  });

  it("una partida sin jugadas sigue exportándose con sus datos", () => {
    const pgn = aPgnExportable([
      { ...base, color: "blancas", resultado: "1", pgn: null },
    ]);
    expect(pgn).toContain('[White "Martínez Ribes, Joan"]');
    expect(pgn.trim().endsWith("1-0")).toBe(true);
  });

  it("varias partidas van separadas por una línea en blanco", () => {
    const pgn = aPgnExportable([
      { ...base, color: "blancas", resultado: "1" },
      { ...base, color: "negras", resultado: "0" },
    ]);
    expect(separarPartidas(pgn)).toHaveLength(2);
  });

  it("escapa las comillas de un nombre para no romper el PGN", () => {
    const pgn = aPgnExportable([
      { ...base, color: "blancas", resultado: "1", rivalNombre: 'El "Mago"' },
    ]);
    expect(pgn).toContain('[Black "El \\"Mago\\""]');
  });
});
