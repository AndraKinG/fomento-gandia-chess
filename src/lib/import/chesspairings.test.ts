import { describe, expect, it } from "vitest";
import { idDesdeEnlace, resultadoDesdeBlancas } from "./chesspairings";

describe("resultadoDesdeBlancas", () => {
  it("traduce su notación a la de la app", () => {
    // Medida en un torneo real de ChessPairings, no adivinada.
    expect(resultadoDesdeBlancas("1-0")).toBe("1");
    expect(resultadoDesdeBlancas("0-1")).toBe("0");
    expect(resultadoDesdeBlancas("1/2-1/2")).toBe("0.5");
  });

  it("sin jugar es null, y NO son tablas", () => {
    // Es el fallo que no se ve: una ronda en marcha tiene los resultados vacíos, y
    // pintarlos como ½ daría puntos que nadie ha hecho, con la clasificación entera con
    // pinta de correcta.
    expect(resultadoDesdeBlancas(null)).toBeNull();
    expect(resultadoDesdeBlancas("")).toBeNull();
    expect(resultadoDesdeBlancas(undefined)).toBeNull();
  });

  it("el bye no es una partida con resultado", () => {
    expect(resultadoDesdeBlancas("+--")).toBeNull();
  });

  it("aguanta las otras formas de escribir unas tablas", () => {
    expect(resultadoDesdeBlancas("½-½")).toBe("0.5");
    expect(resultadoDesdeBlancas("0.5-0.5")).toBe("0.5");
  });
});

describe("idDesdeEnlace", () => {
  it("saca el id del enlace público", () => {
    expect(
      idDesdeEnlace("https://my.chesspairings.org/pubblico/torneo.php?id=5759&token=abc")
    ).toBe(5759);
  });

  it("vale aunque el enlace esté a medias, porque el id es lo único que usamos", () => {
    // Caso real: se pegó sin el `/pubblico/` y funcionó porque el id estaba.
    expect(idDesdeEnlace("https://my.chesspairings.org/torneo.php?id=5759")).toBe(5759);
  });

  it("un enlace sin id no es de un torneo", () => {
    // Guardarlo sin más deja una pantalla que no trae nada y parece que está roto.
    expect(idDesdeEnlace("https://my.chesspairings.org/")).toBeNull();
    expect(idDesdeEnlace(null)).toBeNull();
    expect(idDesdeEnlace("")).toBeNull();
  });
});
