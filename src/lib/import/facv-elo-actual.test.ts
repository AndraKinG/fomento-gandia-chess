import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEloActualFACV } from "./facv-elo-actual";

// Fixture REAL: la respuesta del ranking FACV filtrado por el club,
// descargada el 2026-08-11 (35 socios con ELO de clásicas).
const html = readFileSync(join(__dirname, "fixtures", "facv-elo-actual.html"), "utf-8");

describe("parseEloActualFACV", () => {
  it("saca a los 35 socios con su ELO actual", () => {
    const filas = parseEloActualFACV(html);
    expect(filas).toHaveLength(35);
    // El dato que destapó todo esto: el ELO AL DÍA de Crecente es 2081, no el
    // 2087 del orden de fuerza (que es su ELO de cuando se creó el documento).
    expect(filas[0]).toEqual({ nombre: "José Manuel Crecente Penalba", elo: 2081 });
  });

  it("no trae ceros ni nombres vacíos", () => {
    for (const f of parseEloActualFACV(html)) {
      expect(f.nombre.length).toBeGreaterThan(3);
      expect(f.elo).toBeGreaterThan(0);
    }
  });

  it("quita el título FIDE del nombre si lo hay", () => {
    // En el ranking general los titulados llevan "GM"/"IM" en un span delante del
    // nombre; en el del club hoy no hay ninguno, así que se prueba con HTML de la
    // misma forma que el real.
    const conTitulo = `<tbody><tr> <td>1</td> <td> <span class="chess-title">GM</span> Jaime Santos Latasa </td> <td><div><img src='x'></div></td> <td>2620</td> <td></td> </tr></tbody>`;
    expect(parseEloActualFACV(conTitulo)).toEqual([
      { nombre: "Jaime Santos Latasa", elo: 2620 },
    ]);
  });

  it("con HTML vacío devuelve []", () => {
    expect(parseEloActualFACV("")).toEqual([]);
  });
});
