import { describe, expect, it } from "vitest";
import { esUrlDeChessResults } from "./red";

describe("esUrlDeChessResults", () => {
  it("acepta chess-results con y sin www, solo https", () => {
    expect(esUrlDeChessResults("https://chess-results.com/tnr1326545.aspx?art=46")).toBe(true);
    expect(esUrlDeChessResults("https://www.chess-results.com/tnr1.aspx")).toBe(true);
    expect(esUrlDeChessResults("http://chess-results.com/tnr1.aspx")).toBe(false);
  });

  it("rechaza otros hosts, aunque disimulen", () => {
    // Estos enlaces vienen del HTML de la FACV, no de nosotros: el cron los
    // seguiría con privilegio de servidor, y por eso el host se comprueba.
    expect(esUrlDeChessResults("https://malo.com/chess-results.com")).toBe(false);
    expect(esUrlDeChessResults("https://chess-results.com.malo.com/x")).toBe(false);
    expect(esUrlDeChessResults("https://xchess-results.com/x")).toBe(false);
  });

  it("con basura no lanza: devuelve false", () => {
    expect(esUrlDeChessResults("")).toBe(false);
    expect(esUrlDeChessResults("no es una url")).toBe(false);
  });
});
