import { describe, expect, it } from "vitest";
import { filtroBusqueda, valorSeguro } from "./buscar";

describe("valorSeguro", () => {
  it("usa el comodín de PostgREST, que es * y no %", () => {
    // Con `%` dentro de un `or()` la consulta entera fallaba y la pantalla se
    // quedaba sin ninguna partida.
    expect(valorSeguro("Emilio")).toBe("*Emilio*");
  });

  it("entrecomilla si el texto trae una coma", () => {
    // Sin comillas, la coma partiría la condición en dos y rompería el árbol lógico.
    expect(valorSeguro("Pérez, Juan")).toBe('"*Pérez, Juan*"');
  });

  it("entrecomilla si trae paréntesis", () => {
    expect(valorSeguro("García (hijo)")).toBe('"*García (hijo)*"');
  });

  it("escapa las comillas dobles del propio texto", () => {
    expect(valorSeguro('el "Ximo"')).toBe('"*el \\"Ximo\\"*"');
  });

  it("deja en paz un texto normal con acentos y espacios", () => {
    expect(valorSeguro("Martínez Ribes")).toBe("*Martínez Ribes*");
  });
});

describe("filtroBusqueda", () => {
  it("sin socios que cuadren, busca solo por el nombre del rival", () => {
    // Un `in.()` vacío volvería a romper el análisis de PostgREST.
    expect(filtroBusqueda("Randazzo", [])).toBe("rival_nombre.ilike.*Randazzo*");
  });

  it("con socios que cuadran, busca por rival O por dueño de la partida", () => {
    expect(filtroBusqueda("Emilio", ["aaa", "bbb"])).toBe(
      "rival_nombre.ilike.*Emilio*,player_id.in.(aaa,bbb)"
    );
  });

  it("no filtra por la tabla incrustada", () => {
    // Filtrar por `players.nombre` dentro de un `or()` es justo lo que fallaba.
    expect(filtroBusqueda("Emilio", ["aaa"])).not.toContain("players.");
  });

  it("quita los espacios de los lados", () => {
    expect(filtroBusqueda("  Emilio  ", [])).toBe("rival_nombre.ilike.*Emilio*");
  });
});
