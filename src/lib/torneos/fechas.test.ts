import { describe, expect, it } from "vitest";
import { estaEnCurso, formatearRangoFechas, haTerminado, hoyISO } from "./fechas";

describe("hoyISO", () => {
  it("devuelve una fecha en formato yyyy-mm-dd", () => {
    expect(hoyISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatearRangoFechas", () => {
  it("un solo día lleva el día de la semana", () => {
    // Sábado 3 de enero de 2026.
    expect(formatearRangoFechas("2026-01-03", "2026-01-03")).toBe("sáb, 3 ene");
  });

  it("trata fin vacío como torneo de un día", () => {
    expect(formatearRangoFechas("2026-01-03", "")).toBe("sáb, 3 ene");
  });

  it("dos días del mismo mes no repiten el mes", () => {
    expect(formatearRangoFechas("2026-01-02", "2026-01-03")).toBe("2 – 3 ene");
  });

  it("un torneo que cruza de mes muestra los dos meses", () => {
    // Es el caso real del Aut. Absoluto 2026, que aparece en las tablas de
    // abril y de mayo del calendario FACV.
    expect(formatearRangoFechas("2026-04-30", "2026-05-03")).toBe("30 abr – 3 may");
  });

  it("un torneo que cruza de año muestra los años", () => {
    expect(formatearRangoFechas("2026-12-27", "2027-01-03")).toBe(
      "27 dic 2026 – 3 ene 2027"
    );
  });

  it("sin fecha de inicio no inventa nada", () => {
    expect(formatearRangoFechas("", "2026-01-03")).toBe("Sin fecha");
  });

  it("no desplaza el día por husos horarios", () => {
    // El día 1 de un mes es el caso donde un error de zona horaria se ve mejor:
    // medianoche UTC del 1 de febrero sigue siendo 31 de enero al oeste.
    expect(formatearRangoFechas("2026-02-01", "2026-02-01")).toContain("1 feb");
  });
});

describe("haTerminado", () => {
  it.each([
    ["2026-01-03", "2026-01-04", true],
    ["2026-01-04", "2026-01-04", false], // el último día todavía cuenta
    ["2026-01-05", "2026-01-04", false],
  ])("fin %s con hoy %s → %s", (fin, hoy, esperado) => {
    expect(haTerminado(fin, hoy)).toBe(esperado);
  });
});

describe("estaEnCurso", () => {
  it("hoy dentro del rango, incluidos los extremos", () => {
    expect(estaEnCurso("2026-04-30", "2026-05-03", "2026-04-30")).toBe(true);
    expect(estaEnCurso("2026-04-30", "2026-05-03", "2026-05-02")).toBe(true);
    expect(estaEnCurso("2026-04-30", "2026-05-03", "2026-05-03")).toBe(true);
  });

  it("fuera del rango", () => {
    expect(estaEnCurso("2026-04-30", "2026-05-03", "2026-04-29")).toBe(false);
    expect(estaEnCurso("2026-04-30", "2026-05-03", "2026-05-04")).toBe(false);
  });
});
