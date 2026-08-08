import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { fechaDeListaFeda, obtenerUrlUltimaListaFeda, parseListaFeda } from "./feda";

const xlsx = readFileSync(join(__dirname, "fixtures", "feda-lista.xlsx"));

describe("parseListaFeda", () => {
  const lista = parseListaFeda(xlsx.buffer as ArrayBuffer);

  it("indexa por id FEDA con datos reales del fichero", () => {
    expect(lista.porFeda.size).toBeGreaterThan(1000);
    // Pares reales anotados del fixture (Lista Elo FEDA Octubre 2023):
    // fila "Aalbersberg Kroon, Pedro" -> Id. FEDA 1075, Elo 1658
    expect(lista.porFeda.get("1075")?.elo).toBe(1658);
    // fila "Aalders, Hendricus" -> Id. FEDA 13036, Elo 1948
    expect(lista.porFeda.get("13036")?.elo).toBe(1948);
  });

  it("indexa TAMBIÉN por id FIDE, que es lo que tienen las fichas del club", () => {
    // Sin este índice el importador no podía actualizar a nadie: las 46 fichas del
    // club tienen `fide_id` y ninguna tiene `feda_id`.
    expect(lista.porFide.size).toBeGreaterThan(1000);
    // "Aalbersberg Kroon, Pedro" -> Id. Fide 2252465
    expect(lista.porFide.get("2252465")?.elo).toBe(1658);
    expect(lista.porFide.get("2252465")?.fedaId).toBe("1075");
  });

  it("una fila sin id FIDE entra en el índice FEDA pero no en el de FIDE", () => {
    const sheet = XLSX.utils.json_to_sheet([
      { "Id. FEDA": 99, "Id. Fide": "", "Elo": 1500 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Hoja1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseListaFeda(buffer);
    expect(r.porFeda.get("99")?.elo).toBe(1500);
    expect(r.porFeda.get("99")?.fideId).toBeNull();
    expect(r.porFide.size).toBe(0);
  });

  it("devuelve mapas vacíos si el fichero no tiene las columnas esperadas", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Nombre", "Puntuación"],
      ["Alguien", 1500],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Hoja1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseListaFeda(buffer);
    expect(r.porFeda.size).toBe(0);
    expect(r.porFide.size).toBe(0);
  });
});

describe("fechaDeListaFeda", () => {
  it("saca año y mes del nombre del fichero", () => {
    expect(fechaDeListaFeda("https://feda.org/x/2023_12_FEDA.xlsx")).toBe(202312);
  });

  it("aguanta los nombres con sufijo, que los hay", () => {
    // Reales en la página: "2022_10_FEDA-3.xlsx", "2023_08_FEDA-2.xlsx".
    expect(fechaDeListaFeda("https://feda.org/x/2022_10_FEDA-3.xlsx")).toBe(202210);
  });

  it("null si el nombre no lleva fecha", () => {
    expect(fechaDeListaFeda("https://feda.org/x/lista.xlsx")).toBeNull();
  });
});

describe("obtenerUrlUltimaListaFeda", () => {
  it("elige la MÁS RECIENTE, no la primera de la página", () => {
    // La página de la FEDA los lista desordenados (comprobado: 12, 06, 11, 05, 10…),
    // así que quedarse con el primer enlace daba la más reciente por casualidad.
    const html = `
      <a href="https://feda.org/x/2023_06_FEDA.xlsx">Junio</a>
      <a href="https://feda.org/x/2023_12_FEDA.xlsx">Diciembre</a>
      <a href="https://feda.org/x/2023_09_FEDA.xlsx">Septiembre</a>`;
    expect(obtenerUrlUltimaListaFeda(html)).toBe(
      "https://feda.org/x/2023_12_FEDA.xlsx"
    );
  });

  it("compara bien entre años, no solo por mes", () => {
    const html = `
      <a href="https://feda.org/x/2023_02_FEDA.xlsx">Feb 2023</a>
      <a href="https://feda.org/x/2022_12_FEDA.xlsx">Dic 2022</a>`;
    expect(obtenerUrlUltimaListaFeda(html)).toBe(
      "https://feda.org/x/2023_02_FEDA.xlsx"
    );
  });

  it("sin fechas reconocibles se queda con el primero, como antes", () => {
    const html = `<a href="https://feda.org/x/lista.xlsx">Lista</a>`;
    expect(obtenerUrlUltimaListaFeda(html)).toBe("https://feda.org/x/lista.xlsx");
  });

  it("null si no hay enlaces xlsx", () => {
    expect(obtenerUrlUltimaListaFeda("<p>nada</p>")).toBeNull();
  });
});
