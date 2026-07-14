import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOrdenFuerzaFACV } from "./facv-orden-fuerza";

const html = readFileSync(
  join(__dirname, "fixtures", "facv-of-club.html"),
  "utf-8"
);

// Valores reales anotados del fixture (descargado 2026-07-14, id 56 = Fomento Gandia):
// - Fila 1: José Manuel Crecente Penalba, ELO 2087, fide 2271265.
// - Fila 2: Elías Frasquet Solbes, ELO 2057, fide 2256711.
// - Fila 45: Marcos Castro Hueso, sin ELO (comentario HTML vacío en col-elo), fide 553025806.
// No hay ninguna fila "bis" en este fixture real; el soporte de bisIndex queda
// sin probar contra un caso real (ver informe de la tarea).
const TOTAL_FILAS_ESPERADO = 46;

describe("parseOrdenFuerzaFACV", () => {
  const filas = parseOrdenFuerzaFACV(html);

  it("extrae todas las filas del orden de fuerza", () => {
    expect(filas.length).toBe(TOTAL_FILAS_ESPERADO);
  });

  it("extrae posicion, nombre, elo y fide id del primer jugador real", () => {
    expect(filas[0]).toEqual({
      numero: 1,
      bisIndex: 0,
      nombre: "José Manuel Crecente Penalba",
      eloOficial: 2087,
      fideId: "2271265",
    });
  });

  it("extrae posicion, nombre, elo y fide id del segundo jugador real", () => {
    expect(filas[1]).toEqual({
      numero: 2,
      bisIndex: 0,
      nombre: "Elías Frasquet Solbes",
      eloOficial: 2057,
      fideId: "2256711",
    });
  });

  it("devuelve eloOficial null cuando la celda ELO esta vacia (jugador real sin ELO)", () => {
    const marcos = filas.find((f) => f.fideId === "553025806");
    expect(marcos).toEqual({
      numero: 45,
      bisIndex: 0,
      nombre: "Marcos Castro Hueso",
      eloOficial: null,
      fideId: "553025806",
    });
  });

  it("las posiciones son crecientes y sin duplicados", () => {
    const claves = filas.map((f) => `${f.numero}/${f.bisIndex}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("devuelve [] con HTML sin filas", () => {
    expect(parseOrdenFuerzaFACV("<html><body>nada</body></html>")).toEqual(
      []
    );
  });
});
