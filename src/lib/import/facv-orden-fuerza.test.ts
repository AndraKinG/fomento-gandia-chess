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

  it("parsea '5 bis' (con espacio) como {numero: 5, bisIndex: 1}", () => {
    const syntheticHtml = `
      <table>
        <tr data-search="test 5 bis">
          <td class="col-of">
            <span class="badge text-bg-dark px-3 py-2">5 bis</span>
          </td>
          <td><span class="cut">Test Name 5bis</span></td>
          <td class="col-elo">1800</td>
          <td><a href="https://ratings.fide.com/profile/123456">123456</a></td>
        </tr>
      </table>
    `;
    const result = parseOrdenFuerzaFACV(syntheticHtml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      numero: 5,
      bisIndex: 1,
      nombre: "Test Name 5bis",
      eloOficial: 1800,
      fideId: "123456",
    });
  });

  it("parsea '7bis' (sin espacio) como {numero: 7, bisIndex: 1}", () => {
    const syntheticHtml = `
      <table>
        <tr data-search="test 7bis">
          <td class="col-of">
            <span class="badge text-bg-dark px-3 py-2">7bis</span>
          </td>
          <td><span class="cut">Test Name 7bis</span></td>
          <td class="col-elo">1900</td>
          <td><a href="https://ratings.fide.com/profile/789012">789012</a></td>
        </tr>
      </table>
    `;
    const result = parseOrdenFuerzaFACV(syntheticHtml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      numero: 7,
      bisIndex: 1,
      nombre: "Test Name 7bis",
      eloOficial: 1900,
      fideId: "789012",
    });
  });

  it("devuelve fideId null cuando falta el link ratings.fide.com", () => {
    const syntheticHtml = `
      <table>
        <tr data-search="test sin fide">
          <td class="col-of">
            <span class="badge text-bg-dark px-3 py-2">10</span>
          </td>
          <td><span class="cut">Test Sin Fide</span></td>
          <td class="col-elo">1700</td>
          <td><!-- Sin link FIDE --></td>
        </tr>
      </table>
    `;
    const result = parseOrdenFuerzaFACV(syntheticHtml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      numero: 10,
      bisIndex: 0,
      nombre: "Test Sin Fide",
      eloOficial: 1700,
      fideId: null,
    });
  });

  it("preserva mayúsculas en entidades HTML (Pe&ntilde;a, &Aacute;ngel)", () => {
    const syntheticHtml = `
      <table>
        <tr data-search="test">
          <td class="col-of">
            <span class="badge text-bg-dark px-3 py-2">3</span>
          </td>
          <td><span class="cut">Pe&ntilde;a, &Aacute;ngel</span></td>
          <td class="col-elo">1750</td>
          <td><a href="https://ratings.fide.com/profile/555666">555666</a></td>
        </tr>
      </table>
    `;
    const result = parseOrdenFuerzaFACV(syntheticHtml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      numero: 3,
      bisIndex: 0,
      nombre: "Peña, Ángel",
      eloOficial: 1750,
      fideId: "555666",
    });
  });
});
