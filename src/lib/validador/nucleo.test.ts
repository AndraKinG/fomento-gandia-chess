import { describe, expect, it } from "vitest";
import { validarNucleo } from "./nucleo";
import type { ConfigEquipo, JugadorOrden, TableroPropuesto } from "./tipos";

/** Construye un JugadorOrden de prueba. */
function j(
  numero: number,
  fuerza: number,
  opts: Partial<Pick<JugadorOrden, "bisIndex" | "excepcionMargen" | "nombre">> = {}
): JugadorOrden {
  const bisIndex = opts.bisIndex ?? 0;
  const suffix = bisIndex > 0 ? `bis${bisIndex}` : "";
  return {
    playerId: `p${numero}${suffix}`,
    nombre: opts.nombre ?? `Jugador${numero}${suffix}`,
    numero,
    bisIndex,
    fuerza,
    excepcionMargen: opts.excepcionMargen ?? false,
  };
}

function t(tablero: number, playerId: string): TableroPropuesto {
  return { tablero, playerId };
}

function cfg(margenElo: number | null, numTableros = 8): ConfigEquipo {
  return { margenElo, numTableros };
}

function errores(infs: { nivel: "error" | "aviso" }[]) {
  return infs.filter((i) => i.nivel === "error");
}

function avisos(infs: { nivel: "error" | "aviso" }[]) {
  return infs.filter((i) => i.nivel === "aviso");
}

describe("validarNucleo (RGC arts. 50-52)", () => {
  // 1. Alineación en orden perfecto, sin margen → sin infracciones.
  it("orden perfecto sin margen no genera infracciones", () => {
    const orden = Array.from({ length: 8 }, (_, i) => j(i + 1, 2300 - i * 20));
    const alineacion = orden.map((p, i) => t(i + 1, p.playerId));
    const infs = validarNucleo(orden, alineacion, cfg(null));
    expect(infs).toEqual([]);
  });

  // 2. Sin margen (B/C): nº14 delante del nº9 → error 51.2 con ambos nombres.
  it("sin margen: nº14 delante del nº9 es error 51.2 con ambos nombres", () => {
    const orden = [j(9, 1800), j(14, 1600)];
    const alineacion = [t(1, "p14"), t(2, "p9")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    const err = errores(infs).find((e) => e.articulo === "51.2");
    expect(err).toBeDefined();
    expect(err!.mensaje).toContain("Jugador14");
    expect(err!.mensaje).toContain("Jugador9");
  });

  // 3. Margen 200 (A): delante alguien 150 puntos peor → aviso "inversión legal (<200)".
  it("margen 200: inversión con diferencia 150 es aviso de inversión legal", () => {
    const orden = [j(3, 2150), j(5, 2000)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200));
    expect(errores(infs)).toEqual([]);
    const av = avisos(infs).find((a) => a.articulo === "52.3");
    expect(av).toBeDefined();
    expect(av!.mensaje.toLowerCase()).toContain("inversión legal");
    expect(av!.mensaje).toContain("200");
  });

  // 4. Margen 200: delante alguien 250 puntos peor → error 52.3 "supera en 250 ≥ 200".
  it("margen 200: diferencia de 250 es error 52.3", () => {
    const orden = [j(3, 2150), j(5, 1900)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200));
    const err = errores(infs).find((e) => e.articulo === "52.3");
    expect(err).toBeDefined();
    expect(err!.mensaje).toContain("250");
    expect(err!.mensaje).toContain("200");
  });

  // 5. Margen 200, diferencia EXACTA 200 → error (la norma dice "100 puntos o más" → ≥).
  it("margen 200: diferencia exacta de 200 es error (>=)", () => {
    const orden = [j(3, 2150), j(5, 1950)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(true);
  });

  // 6. Margen 100 (División de Honor simulada): 99 → aviso, 100 → error.
  it("margen 100: diferencia 99 es aviso, 100 es error", () => {
    const ordenAviso = [j(3, 2099), j(5, 2000)];
    const alineacionAviso = [t(1, "p5"), t(2, "p3")];
    const infsAviso = validarNucleo(ordenAviso, alineacionAviso, cfg(100));
    expect(errores(infsAviso).some((e) => e.articulo === "52.3")).toBe(false);
    expect(avisos(infsAviso).some((a) => a.articulo === "52.3")).toBe(true);

    const ordenError = [j(3, 2100), j(5, 2000)];
    const alineacionError = [t(1, "p5"), t(2, "p3")];
    const infsError = validarNucleo(ordenError, alineacionError, cfg(100));
    expect(errores(infsError).some((e) => e.articulo === "52.3")).toBe(true);
  });

  // 7. Bis: 7bis se ordena tras el 7 y antes del 8; alinear 8 delante de 7bis sin margen → error.
  it("7bis se ordena entre el 7 y el 8; alinear 8 delante de 7bis es error 51.2", () => {
    const orden = [j(7, 2000), j(7, 1990, { bisIndex: 1 }), j(8, 1980)];
    const alineacion = [t(1, "p8"), t(2, "p7bis1")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    expect(errores(infs).some((e) => e.articulo === "51.2")).toBe(true);
  });

  // 8. 3 bises alineados → error 50.3; 2 bises → sin error.
  it("alinear 3 bises es error 50.3; 2 bises no genera error", () => {
    const orden = [
      j(1, 2200),
      j(1, 2190, { bisIndex: 1 }),
      j(2, 2150),
      j(2, 2140, { bisIndex: 1 }),
      j(3, 2100),
      j(3, 2090, { bisIndex: 1 }),
    ];
    const alineacion3 = [
      t(1, "p1"),
      t(2, "p1bis1"),
      t(3, "p2"),
      t(4, "p2bis1"),
      t(5, "p3"),
      t(6, "p3bis1"),
    ];
    const infs3 = validarNucleo(orden, alineacion3, cfg(null, 8));
    expect(errores(infs3).some((e) => e.articulo === "50.3")).toBe(true);

    const alineacion2 = [
      t(1, "p1"),
      t(2, "p1bis1"),
      t(3, "p2"),
      t(4, "p2bis1"),
      t(5, "p3"),
    ];
    const infs2 = validarNucleo(orden, alineacion2, cfg(null, 8));
    expect(errores(infs2).some((e) => e.articulo === "50.3")).toBe(false);
  });

  // 9. excepcionMargen en el jugador adelantado → sin error, con aviso informativo.
  it("excepcionMargen en el jugador adelantado convierte el error 52.3 en aviso", () => {
    const orden = [j(3, 2150), j(5, 1900, { excepcionMargen: true })];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(false);
    const av = avisos(infs).find((a) => a.articulo === "52.3");
    expect(av).toBeDefined();
    expect(av!.mensaje).toContain("Jugador5");
  });

  // 10. Errores estructurales.
  it("tablero duplicado es error estructural", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(1, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    expect(errores(infs).length).toBeGreaterThan(0);
  });

  it("jugador duplicado (dos tableros) es error estructural", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(2, "p1")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    expect(errores(infs).length).toBeGreaterThan(0);
  });

  it("tablero 9 con numTableros 8 es error estructural", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(9, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(null, 8));
    expect(errores(infs).length).toBeGreaterThan(0);
  });

  it("jugador fuera del orden de fuerza es error estructural", () => {
    const orden = [j(1, 2200)];
    const alineacion = [t(1, "p1"), t(2, "fantasma")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    const err = errores(infs).find((e) => e.mensaje.includes("orden de fuerza"));
    expect(err).toBeDefined();
  });

  // 11. Alineación incompleta y tableros vacíos intercalados → aviso, nunca error.
  it("alineación incompleta (menos tableros que numTableros) es aviso, no error", () => {
    const orden = [j(1, 2200), j(2, 2150), j(3, 2100)];
    const alineacion = [t(1, "p1"), t(2, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(null, 8));
    expect(errores(infs)).toEqual([]);
    expect(avisos(infs).length).toBeGreaterThan(0);
  });

  it("tableros vacíos intercalados generan aviso, no error", () => {
    const orden = [j(1, 2200), j(2, 2150), j(3, 2100), j(4, 2050)];
    const alineacion = [t(1, "p1"), t(3, "p3"), t(4, "p4")]; // falta el 2, intercalado
    const infs = validarNucleo(orden, alineacion, cfg(null, 4));
    expect(errores(infs)).toEqual([]);
    expect(avisos(infs).some((a) => a.tablero === 2)).toBe(true);
  });

  // 12. Fuerzas iguales en inversión: legal con margen, error sin margen.
  it("fuerzas iguales en inversión: legal con margen, error sin margen", () => {
    const orden = [j(3, 2000), j(5, 2000)];
    const alineacion = [t(1, "p5"), t(2, "p3")];

    const conMargen = validarNucleo(orden, alineacion, cfg(200));
    expect(errores(conMargen)).toEqual([]);
    expect(avisos(conMargen).some((a) => a.articulo === "52.3")).toBe(true);

    const sinMargen = validarNucleo(orden, alineacion, cfg(null));
    expect(errores(sinMargen).some((e) => e.articulo === "51.2")).toBe(true);
  });

  // Casos adicionales de robustez.
  it("margen: pareja SIN inversión de orden también dispara 52.3 si la fuerza del de detrás supera el margen", () => {
    // El orden de fuerza del club no siempre es monótono con la fuerza real
    // (excepciones, reordenaciones...). Aquí el nº1 (delante) tiene menos
    // fuerza que el nº2 (detrás): no hay inversión de orden (1 < 2), pero
    // el art. 52.3 no exige inversión, solo que el de detrás supere al de
    // delante en >= margen.
    const orden = [j(1, 1900), j(2, 2200)];
    const alineacion = [t(1, "p1"), t(2, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 2));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(true);
  });

  it("margen: pareja no invertida y por debajo del margen no genera infracción", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(2, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 2));
    expect(infs).toEqual([]);
  });

  it("numTableros 4 con alineación completa y ordenada no genera infracciones", () => {
    const orden = [j(1, 2200), j(2, 2150), j(3, 2100), j(4, 2050)];
    const alineacion = [t(1, "p1"), t(2, "p2"), t(3, "p3"), t(4, "p4")];
    const infs = validarNucleo(orden, alineacion, cfg(null, 4));
    expect(infs).toEqual([]);
  });
});
