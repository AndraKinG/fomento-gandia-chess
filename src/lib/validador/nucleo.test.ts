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

// permitirInversionDentroMargen es un campo OBLIGATORIO de ConfigEquipo (ver
// tipos.ts): el default aquí (true) preserva el comportamiento histórico de
// los tests que no discuten explícitamente el modo estricto/permisivo. Los
// tests que sí lo discuten (casos 3-6 y sus contrapartidas estrictas) lo
// pasan de forma explícita.
function cfg(margenElo: number | null, numTableros = 8, permitirInversionDentroMargen = true): ConfigEquipo {
  return { margenElo, numTableros, permitirInversionDentroMargen };
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
  //    [PERMISIVO] permitirInversionDentroMargen=true mantiene la semántica histórica.
  it("[PERMISIVO] margen 200: inversión con diferencia 150 es aviso de inversión legal", () => {
    const orden = [j(3, 2150), j(5, 2000)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, true));
    expect(errores(infs)).toEqual([]);
    const av = avisos(infs).find((a) => a.articulo === "52.3");
    expect(av).toBeDefined();
    expect(av!.mensaje.toLowerCase()).toContain("inversión legal");
    expect(av!.mensaje).toContain("200");
  });

  // 3b. [ESTRICTO] La misma inversión (diferencia 150 < margen) es SIEMPRE error 51.2
  //     en modo estricto: el margen no exime la inversión de orden (finding 1).
  it("[ESTRICTO] margen 200: inversión con diferencia 150 es error 51.2 (no aviso)", () => {
    const orden = [j(3, 2150), j(5, 2000)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, false));
    const err51 = errores(infs).find((e) => e.articulo === "51.2");
    expect(err51).toBeDefined();
    expect(avisos(infs).some((a) => a.articulo === "52.3")).toBe(false);
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(false);
  });

  // 4. Margen 200: delante alguien 250 puntos peor → error 52.3 "supera en 250 ≥ 200".
  it("[PERMISIVO] margen 200: diferencia de 250 es error 52.3", () => {
    const orden = [j(3, 2150), j(5, 1900)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, true));
    const err = errores(infs).find((e) => e.articulo === "52.3");
    expect(err).toBeDefined();
    expect(err!.mensaje).toContain("250");
    expect(err!.mensaje).toContain("200");
  });

  // 4b. [ESTRICTO] Mismo caso: además del error 52.3 (margen superado), hay
  //     inversión de orden → también error 51.2 (ambos artículos se exigen).
  it("[ESTRICTO] margen 200: diferencia de 250 es error 52.3 Y error 51.2 (inversión)", () => {
    const orden = [j(3, 2150), j(5, 1900)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, false));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(true);
    expect(errores(infs).some((e) => e.articulo === "51.2")).toBe(true);
  });

  // 5. Margen 200, diferencia EXACTA 200 → error (la norma dice "100 puntos o más" → ≥).
  it("[PERMISIVO] margen 200: diferencia exacta de 200 es error (>=)", () => {
    const orden = [j(3, 2150), j(5, 1950)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, true));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(true);
  });

  // 5b. [ESTRICTO] misma diferencia exacta: error 52.3 Y error 51.2.
  it("[ESTRICTO] margen 200: diferencia exacta de 200 es error 52.3 y error 51.2", () => {
    const orden = [j(3, 2150), j(5, 1950)];
    const alineacion = [t(1, "p5"), t(2, "p3")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, false));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(true);
    expect(errores(infs).some((e) => e.articulo === "51.2")).toBe(true);
  });

  // 6. Margen 100 (División de Honor simulada): 99 → aviso, 100 → error.
  it("[PERMISIVO] margen 100: diferencia 99 es aviso, 100 es error", () => {
    const ordenAviso = [j(3, 2099), j(5, 2000)];
    const alineacionAviso = [t(1, "p5"), t(2, "p3")];
    const infsAviso = validarNucleo(ordenAviso, alineacionAviso, cfg(100, 8, true));
    expect(errores(infsAviso).some((e) => e.articulo === "52.3")).toBe(false);
    expect(avisos(infsAviso).some((a) => a.articulo === "52.3")).toBe(true);

    const ordenError = [j(3, 2100), j(5, 2000)];
    const alineacionError = [t(1, "p5"), t(2, "p3")];
    const infsError = validarNucleo(ordenError, alineacionError, cfg(100, 8, true));
    expect(errores(infsError).some((e) => e.articulo === "52.3")).toBe(true);
  });

  // 6b. [ESTRICTO] misma pareja (99 y 100): siempre error 51.2 por la inversión,
  //     con o sin margen superado; a 99 no hay error/aviso 52.3 (no llega al margen),
  //     a 100 sí hay error 52.3 además del 51.2.
  it("[ESTRICTO] margen 100: diferencia 99 es solo error 51.2; 100 es error 51.2 y 52.3", () => {
    const ordenAviso = [j(3, 2099), j(5, 2000)];
    const alineacionAviso = [t(1, "p5"), t(2, "p3")];
    const infsAviso = validarNucleo(ordenAviso, alineacionAviso, cfg(100, 8, false));
    expect(errores(infsAviso).some((e) => e.articulo === "51.2")).toBe(true);
    expect(errores(infsAviso).some((e) => e.articulo === "52.3")).toBe(false);
    expect(avisos(infsAviso).some((a) => a.articulo === "52.3")).toBe(false);

    const ordenError = [j(3, 2100), j(5, 2000)];
    const alineacionError = [t(1, "p5"), t(2, "p3")];
    const infsError = validarNucleo(ordenError, alineacionError, cfg(100, 8, false));
    expect(errores(infsError).some((e) => e.articulo === "51.2")).toBe(true);
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
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, true));
    expect(errores(infs).some((e) => e.articulo === "52.3")).toBe(false);
    const av = avisos(infs).find((a) => a.articulo === "52.3");
    expect(av).toBeDefined();
    expect(av!.mensaje).toContain("Jugador5");
  });

  // 9b. Finding 2 (regresión): excepcionMargen en el jugador de DETRÁS también
  // debe suprimir el error. Caso real: veterano +75 (52.3.e) fuerte que se
  // ubica deliberadamente bajo en el orden; la lista de la FACV coloca al
  // nº2 (1900) delante del nº10 (2400, exento). Sin inversión de orden
  // (2 < 10), pero la diferencia de fuerza (500) supera el margen (200): el
  // validador NO debe bloquear esta alineación aprobada por la FACV.
  it("excepcionMargen en el jugador de DETRÁS también suprime el error 52.3 (regresión probe)", () => {
    const orden = [j(2, 1900), j(10, 2400, { excepcionMargen: true })];
    const alineacion = [t(1, "p2"), t(2, "p10")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 8, true));
    expect(errores(infs)).toEqual([]);
    const av52 = avisos(infs).filter((a) => a.articulo === "52.3");
    expect(av52.length).toBe(1);
    expect(av52[0].mensaje).toContain("Jugador10");
  });

  // 10. Errores estructurales.
  it("tablero duplicado es error estructural", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(1, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    expect(errores(infs).length).toBeGreaterThan(0);
  });

  it("jugador duplicado (dos tableros) es error estructural y cita el NOMBRE, no el playerId", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(2, "p1")];
    const infs = validarNucleo(orden, alineacion, cfg(null));
    const errs = errores(infs);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.mensaje.includes("Jugador1"))).toBe(true);
    expect(errs.some((e) => e.mensaje.includes("p1"))).toBe(false);
  });

  it("tablero 9 con numTableros 8 es error estructural", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(1, "p1"), t(9, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(null, 8));
    expect(errores(infs).length).toBeGreaterThan(0);
  });

  // Finding 5a: un tablero fuera de rango repetido no debe "consumir" el
  // hueco en el set de duplicados; ambas apariciones deben reportarse como
  // "fuera de rango", nunca como "repetido" (el problema real es el rango,
  // no la repetición).
  it("dos entradas con el mismo tablero fuera de rango son ambas 'fuera de rango', no 'repetido'", () => {
    const orden = [j(1, 2200), j(2, 2150)];
    const alineacion = [t(9, "p1"), t(9, "p2")];
    const infs = validarNucleo(orden, alineacion, cfg(null, 8));
    const errs = errores(infs);
    expect(errs.length).toBe(2);
    expect(errs.every((e) => e.mensaje.includes("fuera del rango"))).toBe(true);
    expect(errs.some((e) => e.mensaje.includes("repetido"))).toBe(false);
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

    const conMargen = validarNucleo(orden, alineacion, cfg(200, 8, true));
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

  // Finding 3: regresión compuesta. Margen 200; nº20 (1500, excepcionMargen,
  // joven de tecnificación) en tablero 1; nº10 (2000) en tablero 2; nº5 (2100)
  // en tablero 3. Los 3 pares tienen inversión de orden (20>10>5 en número,
  // pero se alinean en orden inverso de "fuerza de club"). Los pares que
  // involucran al nº20 exento no generan error 52.3 (finding 2), pero SÍ
  // deben generar error 51.2 en modo estricto (el 51.2 no admite excepción).
  describe("Finding 3: compuesto joven exento + inversión nº10/nº5 (margen 200)", () => {
    function compuesto() {
      const orden = [
        j(5, 2100),
        j(10, 2000),
        j(20, 1500, { excepcionMargen: true, nombre: "Joven20" }),
      ];
      const alineacion = [t(1, "p20"), t(2, "p10"), t(3, "p5")];
      return { orden, alineacion };
    }

    it("[ESTRICTO] genera exactamente 3 errores 51.2 (uno por cada par invertido) y 2 avisos 52.3 informativos (exención), 0 errores 52.3", () => {
      const { orden, alineacion } = compuesto();
      const infs = validarNucleo(orden, alineacion, cfg(200, 3, false));
      const errs51 = errores(infs).filter((e) => e.articulo === "51.2");
      const errs52 = errores(infs).filter((e) => e.articulo === "52.3");
      const av52 = avisos(infs).filter((a) => a.articulo === "52.3");
      expect(errs51.length).toBe(3);
      expect(errs52.length).toBe(0);
      expect(av52.length).toBe(2);
    });

    it("[PERMISIVO] con diferencias que no llegan al margen entre nº10/nº5 → solo avisos, ningún error", () => {
      const { orden, alineacion } = compuesto();
      const infs = validarNucleo(orden, alineacion, cfg(200, 3, true));
      expect(errores(infs)).toEqual([]);
      const av52 = avisos(infs).filter((a) => a.articulo === "52.3");
      // 1 "inversión legal" (nº10 delante de nº5, diferencia 100 < 200) +
      // 2 informativos por exención del nº20 (frente a nº10 y frente a nº5).
      expect(av52.length).toBe(3);
    });
  });

  // Finding 4: dedup de avisos "inversión legal". Antes se emitía un aviso
  // por CADA pareja afectada por la inversión (hasta 28 en una alineación
  // reordenada); ahora debe agruparse por el jugador que va delante con peor
  // orden real, en un único aviso que resuma cuántos jugadores con mejor
  // orden le siguen.
  it("Finding 4: un jugador invertido sobre 3 jugadores con mejor orden genera EXACTAMENTE 1 aviso 52.3 (no 3)", () => {
    const orden = [
      j(11, 1900, { nombre: "Ana" }),
      j(12, 1850, { nombre: "Bea" }),
      j(13, 1950, { nombre: "Cris" }),
      j(14, 2000, { nombre: "García" }),
    ];
    // García (nº14, peor orden) se alinea en el tablero 1, por delante de
    // los nº11, nº12 y nº13 (mejor orden), todos con diferencia < 200.
    const alineacion = [t(1, "p14"), t(2, "p11"), t(3, "p12"), t(4, "p13")];
    const infs = validarNucleo(orden, alineacion, cfg(200, 4, true));
    expect(errores(infs)).toEqual([]);
    const av52 = avisos(infs).filter((a) => a.articulo === "52.3");
    expect(av52.length).toBe(1);
    expect(av52[0].mensaje).toContain("García");
    expect(av52[0].mensaje).toContain("nº14");
    expect(av52[0].mensaje).toContain("3");
  });
});
