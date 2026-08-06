import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAlineacionesChessResults,
  parseMarcadorEncuentro,
  parseResultadoTablero,
  tnrDeUrl,
  urlAlineaciones,
} from "./chessresults";

/** Acta real de las 11 rondas del grupo de 1ª Autonómica Sur, temporada 2026. */
const HTML = readFileSync(
  join(__dirname, "fixtures", "chessresults-grupo-a.html"),
  "utf8"
);

describe("parseMarcadorEncuentro", () => {
  it("lee los medios puntos escritos con ½", () => {
    expect(parseMarcadorEncuentro("4½:3½")).toEqual([4.5, 3.5]);
  });

  it("lee la entidad HTML sin convertir", () => {
    expect(parseMarcadorEncuentro("4&frac12;:3&frac12;")).toEqual([4.5, 3.5]);
  });

  it("lee un marcador entero con espacios", () => {
    expect(parseMarcadorEncuentro("4 : 4")).toEqual([4, 4]);
  });

  it("lee un marcador con guión en vez de dos puntos", () => {
    expect(parseMarcadorEncuentro("6 - 2")).toEqual([6, 2]);
  });

  it("un encuentro sin jugar no inventa un 0-0", () => {
    // Un 0-0 guardado se enseñaría como empate a cero, que es un resultado real.
    expect(parseMarcadorEncuentro("-")).toEqual([null, null]);
    expect(parseMarcadorEncuentro("")).toEqual([null, null]);
  });
});

describe("parseResultadoTablero", () => {
  it("victoria del local", () => {
    expect(parseResultadoTablero("1 - 0")).toEqual({
      resultadoLocal: "1",
      incomparecencia: false,
    });
  });

  it("victoria del visitante", () => {
    expect(parseResultadoTablero("0 - 1")).toEqual({
      resultadoLocal: "0",
      incomparecencia: false,
    });
  });

  it("tablas, con la entidad HTML tal cual llega", () => {
    expect(parseResultadoTablero("&frac12; - &frac12;")).toEqual({
      resultadoLocal: "0.5",
      incomparecencia: false,
    });
  });

  it("incomparecencia del visitante: punto para el local, pero marcada", () => {
    // Cuenta como victoria porque suma al marcador, pero se distingue para no
    // enseñarla como una partida jugada.
    expect(parseResultadoTablero("+ - -")).toEqual({
      resultadoLocal: "1",
      incomparecencia: true,
    });
  });

  it("incomparecencia del local", () => {
    expect(parseResultadoTablero("- - +")).toEqual({
      resultadoLocal: "0",
      incomparecencia: true,
    });
  });

  it("doble incomparecencia no puntúa para nadie", () => {
    expect(parseResultadoTablero("- - -")).toEqual({
      resultadoLocal: null,
      incomparecencia: true,
    });
  });

  it("un tablero sin jugar no devuelve resultado", () => {
    expect(parseResultadoTablero("")).toEqual({
      resultadoLocal: null,
      incomparecencia: false,
    });
  });
});

describe("urlAlineaciones y tnrDeUrl", () => {
  it("construye la URL de todas las rondas, sin rd", () => {
    const url = urlAlineaciones(1326331);
    expect(url).toContain("tnr1326331.aspx");
    expect(url).toContain("art=3");
    // Sin `rd=` es lo que trae las once rondas de una vez.
    expect(url).not.toContain("rd=");
  });

  it("saca el id de una URL de chess-results", () => {
    expect(
      tnrDeUrl("https://chess-results.com/tnr1326331.aspx?lan=2&art=46")
    ).toBe(1326331);
  });

  it("devuelve null si la URL no es de chess-results", () => {
    expect(tnrDeUrl("https://www.facv.org/algo.php?id=5")).toBeNull();
  });
});

describe("parseAlineacionesChessResults sobre el acta real de 2026", () => {
  const encuentros = parseAlineacionesChessResults(HTML);

  it("encuentra los 66 encuentros del grupo: 11 rondas por 6 encuentros", () => {
    expect(encuentros).toHaveLength(66);
  });

  it("reparte los encuentros en once rondas de seis", () => {
    const porRonda = new Map<number, number>();
    for (const e of encuentros) porRonda.set(e.ronda, (porRonda.get(e.ronda) ?? 0) + 1);
    expect([...porRonda.keys()].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect([...porRonda.values()]).toEqual(Array(11).fill(6));
  });

  it("cada encuentro trae sus ocho tableros", () => {
    expect(encuentros.every((e) => e.tableros.length === 8)).toBe(true);
    expect(encuentros.reduce((n, e) => n + e.tableros.length, 0)).toBe(528);
  });

  it("lee el encuentro del club de la ronda 1 con su marcador", () => {
    const e = encuentros.find(
      (x) => x.ronda === 1 && x.visitante.includes("Fomento")
    );
    expect(e).toBeDefined();
    expect(e!.local).toBe("Sueca");
    expect(e!.visitante).toContain("Fomento de Gand");
    // La captura de la app enseña 3½ – 4½ desde nuestro lado, que es visitante.
    expect(e!.marcadorLocal).toBe(4.5);
    expect(e!.marcadorVisitante).toBe(3.5);
  });

  it("lee el primer tablero de ese encuentro con nombres, ELO y color", () => {
    const e = encuentros.find(
      (x) => x.ronda === 1 && x.visitante.includes("Fomento")
    )!;
    expect(e.tableros[0]).toEqual({
      tablero: 1,
      localNombre: "Sanz Wawer, Daniel",
      localElo: 2338,
      localBlancas: true,
      visitanteNombre: "Crecente Penalba, Jose Manuel",
      visitanteElo: 2087,
      resultadoLocal: "0.5",
      incomparecencia: false,
    });
  });

  it("los colores alternan tablero a tablero, como manda el reglamento", () => {
    const e = encuentros.find(
      (x) => x.ronda === 1 && x.visitante.includes("Fomento")
    )!;
    expect(e.tableros.map((t) => t.localBlancas)).toEqual([
      true, false, true, false, true, false, true, false,
    ]);
  });

  it("el marcador del encuentro cuadra con la suma de sus tableros", () => {
    // Es la comprobación que de verdad valida el parser: si los tableros se
    // asignaran al encuentro equivocado, o se perdiera alguno, las sumas no
    // cuadrarían con el marcador que publica chess-results.
    const descuadres = encuentros.filter((e) => {
      if (e.marcadorLocal === null) return false;
      const suma = e.tableros.reduce(
        (n, t) =>
          n + (t.resultadoLocal === "1" ? 1 : t.resultadoLocal === "0.5" ? 0.5 : 0),
        0
      );
      return Math.abs(suma - e.marcadorLocal) > 1e-9;
    });
    expect(descuadres.map((e) => `R${e.ronda} ${e.local} vs ${e.visitante}`)).toEqual(
      []
    );
  });

  it("ningún tablero se queda sin nombres", () => {
    const malos = encuentros
      .flatMap((e) => e.tableros)
      .filter((t) => !t.localNombre || !t.visitanteNombre);
    expect(malos).toEqual([]);
  });

  it("los ELO leídos son plausibles", () => {
    const elos = encuentros
      .flatMap((e) => e.tableros)
      .flatMap((t) => [t.localElo, t.visitanteElo])
      .filter((e): e is number => e !== null);
    expect(elos.length).toBeGreaterThan(1000);
    expect(Math.min(...elos)).toBeGreaterThan(1000);
    expect(Math.max(...elos)).toBeLessThan(2600);
  });

  it("las incomparecencias se marcan y no se cuelan como partidas jugadas", () => {
    const porIncomparecencia = encuentros
      .flatMap((e) => e.tableros)
      .filter((t) => t.incomparecencia);
    // Medidas en el acta real: tres tableros ganados sin jugar.
    expect(porIncomparecencia).toHaveLength(3);
    expect(porIncomparecencia.every((t) => t.resultadoLocal === "1")).toBe(true);
  });

  it("no devuelve nada con un HTML que no es el esperado", () => {
    expect(parseAlineacionesChessResults("<html><body>vacío</body></html>")).toEqual(
      []
    );
  });
});
