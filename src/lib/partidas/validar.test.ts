import { describe, expect, it } from "vitest";
import { parecePGN, textoResultado, validarPartida } from "./validar";

const base = {
  fecha: "2026-01-10",
  rivalNombre: "Pérez García, Luis",
  color: "blancas",
  resultado: "1",
};

describe("validarPartida", () => {
  it("acepta lo mínimo y deja el resto en null", () => {
    const r = validarPartida(base);
    expect(r).toEqual({
      ok: true,
      datos: {
        fecha: "2026-01-10",
        rivalNombre: "Pérez García, Luis",
        color: "blancas",
        resultado: "1",
        ronda: null,
        rivalElo: null,
        miElo: null,
        torneoTexto: null,
        apertura: null,
        notas: null,
        pgn: null,
      },
    });
  });

  it.each(["", "10/01/2026", "2026-1-10", "ayer"])(
    "rechaza la fecha %j",
    (fecha) => {
      expect(validarPartida({ ...base, fecha }).ok).toBe(false);
    }
  );

  it.each(["", "A", "  "])("rechaza el nombre de rival %j", (rivalNombre) => {
    expect(validarPartida({ ...base, rivalNombre }).ok).toBe(false);
  });

  it("colapsa los espacios del nombre del rival", () => {
    const r = validarPartida({ ...base, rivalNombre: "  Pérez   García  " });
    expect(r.ok && r.datos.rivalNombre).toBe("Pérez García");
  });

  it.each(["", "blanco", "white", "BLANCAS"])("rechaza el color %j", (color) => {
    expect(validarPartida({ ...base, color }).ok).toBe(false);
  });

  it.each(["", "1/2", "0,5", "tablas", "2"])(
    "rechaza el resultado %j",
    (resultado) => {
      expect(validarPartida({ ...base, resultado }).ok).toBe(false);
    }
  );

  it.each(["1", "0.5", "0"])("acepta el resultado %j", (resultado) => {
    expect(validarPartida({ ...base, resultado }).ok).toBe(true);
  });

  describe("números opcionales", () => {
    it("vacío es null, no cero: no haber puesto el ELO no es tener 0", () => {
      const r = validarPartida({ ...base, rivalElo: "", miElo: "   ", ronda: "" });
      expect(r.ok && r.datos.rivalElo).toBeNull();
      expect(r.ok && r.datos.miElo).toBeNull();
      expect(r.ok && r.datos.ronda).toBeNull();
    });

    it("los convierte cuando vienen", () => {
      const r = validarPartida({ ...base, rivalElo: "1850", miElo: " 1902 ", ronda: "3" });
      expect(r.ok && r.datos.rivalElo).toBe(1850);
      expect(r.ok && r.datos.miElo).toBe(1902);
      expect(r.ok && r.datos.ronda).toBe(3);
    });

    it.each(["mil ochocientos", "18a0", "-5", "1.5"])(
      "rechaza el ELO %j por no ser un número",
      (rivalElo) => {
        expect(validarPartida({ ...base, rivalElo }).ok).toBe(false);
      }
    );

    it("rechaza un ELO fuera de rango", () => {
      expect(validarPartida({ ...base, rivalElo: "9999" }).ok).toBe(false);
    });

    it("rechaza la ronda 0", () => {
      expect(validarPartida({ ...base, ronda: "0" }).ok).toBe(false);
    });
  });

  describe("PGN", () => {
    it("acepta un PGN con jugadas", () => {
      const r = validarPartida({ ...base, pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5" });
      expect(r.ok && r.datos.pgn).toContain("1. e4");
    });

    it("acepta un PGN con solo cabeceras", () => {
      const r = validarPartida({ ...base, pgn: '[Event "Open Albal"]\n[Site "Albal"]' });
      expect(r.ok).toBe(true);
    });

    it("conserva los saltos de línea, que en un PGN significan algo", () => {
      const pgn = '[Event "X"]\n\n1. e4 e5';
      const r = validarPartida({ ...base, pgn });
      expect(r.ok && r.datos.pgn).toBe(pgn);
    });

    it("rechaza un pegado accidental de otra cosa", () => {
      const r = validarPartida({ ...base, pgn: "Hola, te mando la partida del sábado" });
      expect(r.ok).toBe(false);
    });

    it("un PGN vacío no es un error: es opcional", () => {
      expect(validarPartida({ ...base, pgn: "   " }).ok).toBe(true);
    });
  });

  it("corta unas notas kilométricas en vez de rechazarlas", () => {
    const r = validarPartida({ ...base, notas: "x".repeat(9000) });
    expect(r.ok && r.datos.notas?.length).toBe(5000);
  });
});

describe("parecePGN", () => {
  it.each([
    ["1.e4", true],
    ["1. e4 e5", true],
    ['[Event "Torneo"]', true],
    ["e4 e5 Nf3", false], // sin numeración no distingue de texto suelto
    ["", false],
    ["te paso la partida", false],
  ])("parecePGN(%j) → %s", (texto, esperado) => {
    expect(parecePGN(texto)).toBe(esperado);
  });
});

describe("textoResultado", () => {
  it.each([
    ["1", "Victoria"],
    ["0.5", "Tablas"],
    ["0", "Derrota"],
  ] as const)("%s → %s", (r, esperado) => {
    expect(textoResultado(r)).toBe(esperado);
  });
});
