import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { obtenerUrlUltimaListaFeda, parseListaFeda } from "./feda";

const xlsx = readFileSync(join(__dirname, "fixtures", "feda-lista.xlsx"));

describe("parseListaFeda", () => {
  it("mapea feda_id -> elo con datos reales del fichero", () => {
    const mapa = parseListaFeda(xlsx.buffer as ArrayBuffer);
    expect(mapa.size).toBeGreaterThan(1000);
    // Pares reales anotados del fixture (Lista Elo FEDA Octubre 2023):
    // fila "Aalbersberg Kroon, Pedro" -> Id. FEDA 1075, Elo 1658
    expect(mapa.get("1075")).toBe(1658);
    // fila "Aalders, Hendricus" -> Id. FEDA 13036, Elo 1948
    expect(mapa.get("13036")).toBe(1948);
  });

  it("devuelve un mapa vacío si el fichero no tiene las columnas esperadas", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Nombre", "Puntuación"],
      ["Alguien", 1500],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Hoja1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const mapa = parseListaFeda(buffer);
    expect(mapa.size).toBe(0);
  });
});

describe("obtenerUrlUltimaListaFeda", () => {
  it("devuelve el primer enlace .xlsx de la pagina", () => {
    const html = `<a href="/old.pdf">x</a>
      <a href="https://feda.org/files/lista_junio.xlsx">Lista Elo FEDA Junio</a>
      <a href="https://feda.org/files/lista_mayo.xlsx">Mayo</a>`;
    expect(obtenerUrlUltimaListaFeda(html)).toBe(
      "https://feda.org/files/lista_junio.xlsx"
    );
  });
  it("null si no hay enlaces xlsx", () => {
    expect(obtenerUrlUltimaListaFeda("<p>nada</p>")).toBeNull();
  });
});
