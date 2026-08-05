import { describe, expect, it } from "vitest";
import {
  balanceColor,
  calendarioLiguilla,
  colorearEnfrentamiento,
  emparejarSuizo,
  rondasRecomendadas,
  type EstadoJugador,
} from "./emparejar";

const jugador = (
  ficha: string,
  extra: Partial<EstadoJugador> = {}
): EstadoJugador => ({
  ficha,
  puntos: 0,
  elo: 1800,
  rivales: [],
  colores: [],
  haDescansado: false,
  ...extra,
});

describe("calendarioLiguilla", () => {
  it("con 4 jugadores salen 3 rondas de 2 partidas", () => {
    const rondas = calendarioLiguilla(["a", "b", "c", "d"]);
    expect(rondas).toHaveLength(3);
    for (const r of rondas) {
      expect(r.emparejamientos).toHaveLength(2);
      expect(r.descansa).toBeNull();
    }
  });

  it("todos juegan contra todos exactamente una vez", () => {
    const fichas = ["a", "b", "c", "d", "e", "f"];
    const rondas = calendarioLiguilla(fichas);
    const cruces = new Set<string>();
    for (const r of rondas) {
      for (const e of r.emparejamientos) {
        cruces.add([e.blancas, e.negras].sort().join("-"));
      }
    }
    // Combinaciones de 6 tomadas de 2 = 15.
    expect(cruces.size).toBe(15);
    expect(rondas).toHaveLength(5);
  });

  it("nadie se enfrenta a sí mismo", () => {
    for (const r of calendarioLiguilla(["a", "b", "c", "d", "e"])) {
      for (const e of r.emparejamientos) expect(e.blancas).not.toBe(e.negras);
    }
  });

  it("con impares, cada ronda descansa uno distinto y nadie juega dos veces", () => {
    const rondas = calendarioLiguilla(["a", "b", "c", "d", "e"]);
    expect(rondas).toHaveLength(5);
    const descansos = rondas.map((r) => r.descansa);
    expect(new Set(descansos).size).toBe(5); // los 5, uno por ronda
    for (const r of rondas) {
      const enJuego = r.emparejamientos.flatMap((e) => [e.blancas, e.negras]);
      expect(new Set(enJuego).size).toBe(enJuego.length);
      expect(enJuego).not.toContain(r.descansa);
    }
  });

  it("reparte los colores: nadie lleva blancas en todas las rondas", () => {
    const rondas = calendarioLiguilla(["a", "b", "c", "d"]);
    for (const ficha of ["a", "b", "c", "d"]) {
      const blancas = rondas.filter((r) =>
        r.emparejamientos.some((e) => e.blancas === ficha)
      ).length;
      expect(blancas).toBeGreaterThan(0);
      expect(blancas).toBeLessThan(rondas.length);
    }
  });

  it("con menos de dos jugadores no hay torneo", () => {
    expect(calendarioLiguilla([])).toEqual([]);
    expect(calendarioLiguilla(["a"])).toEqual([]);
  });

  // Blindaje del bug que tuvo la primera versión: alternando los colores por
  // paridad de ronda, el método del círculo deja a un jugador SIEMPRE en el mismo
  // lado y en una liguilla de 4 alguien no llevaba blancas ni una vez.
  it.each([4, 5, 6, 7, 8, 10, 12])(
    "con %i jugadores, el reparto de colores es justo para todos",
    (cuantos) => {
      const fichas = Array.from({ length: cuantos }, (_, i) => `j${i}`);
      const rondas = calendarioLiguilla(fichas);

      const blancas = new Map(fichas.map((f) => [f, 0]));
      const total = new Map(fichas.map((f) => [f, 0]));
      for (const r of rondas) {
        for (const e of r.emparejamientos) {
          blancas.set(e.blancas, blancas.get(e.blancas)! + 1);
          total.set(e.blancas, total.get(e.blancas)! + 1);
          total.set(e.negras, total.get(e.negras)! + 1);
        }
      }

      for (const f of fichas) {
        const conBlancas = blancas.get(f)!;
        const partidas = total.get(f)!;
        expect(partidas).toBe(cuantos - 1); // juega contra todos
        expect(conBlancas).toBeGreaterThan(0); // nadie se queda sin blancas

        // Se exige el reparto ÓPTIMO, no solo uno aceptable:
        //  - jugadores impares → cada uno juega un número par de partidas, así
        //    que el reparto puede ser exacto y el desequilibrio debe ser 0.
        //  - jugadores pares → número impar de partidas, el ±1 es inevitable.
        const maximo = cuantos % 2 === 1 ? 0 : 1;
        expect(Math.abs(conBlancas - (partidas - conBlancas))).toBe(maximo);
      }
    }
  );
});

describe("balanceColor", () => {
  it.each([
    [[], 0],
    [["blancas"], 1],
    [["blancas", "negras"], 0],
    [["blancas", "blancas", "negras"], 1],
    [["negras", "negras"], -2],
  ] as const)("balance de %j es %i", (colores, esperado) => {
    expect(balanceColor([...colores])).toBe(esperado);
  });
});

describe("colorearEnfrentamiento", () => {
  it("lleva blancas quien menos ha llevado", () => {
    const a = jugador("a", { colores: ["blancas", "blancas"] });
    const b = jugador("b", { colores: ["negras", "negras"] });
    expect(colorearEnfrentamiento(a, b)).toEqual({ blancas: "b", negras: "a" });
  });

  it("con el mismo balance, blancas para quien no las llevó la última vez", () => {
    const a = jugador("a", { colores: ["blancas", "negras"] }); // última: negras
    const b = jugador("b", { colores: ["negras", "blancas"] }); // última: blancas
    expect(colorearEnfrentamiento(a, b)).toEqual({ blancas: "a", negras: "b" });
  });

  it("en la primera ronda decide el ELO, y es determinista", () => {
    const fuerte = jugador("fuerte", { elo: 2000 });
    const flojo = jugador("flojo", { elo: 1600 });
    expect(colorearEnfrentamiento(fuerte, flojo)).toEqual({
      blancas: "fuerte",
      negras: "flojo",
    });
    // El orden de los argumentos no cambia el resultado.
    expect(colorearEnfrentamiento(flojo, fuerte)).toEqual({
      blancas: "fuerte",
      negras: "flojo",
    });
  });
});

describe("emparejarSuizo", () => {
  it("empareja a todos y nadie repite en la misma ronda", () => {
    const r = emparejarSuizo(
      ["a", "b", "c", "d", "e", "f"].map((f) => jugador(f)),
      1
    );
    expect(r.emparejamientos).toHaveLength(3);
    const enJuego = r.emparejamientos.flatMap((e) => [e.blancas, e.negras]);
    expect(new Set(enJuego).size).toBe(6);
    expect(r.descansa).toBeNull();
  });

  it("empareja por puntuación: los líderes entre ellos", () => {
    const jugadores = [
      jugador("lider1", { puntos: 2, elo: 1900 }),
      jugador("lider2", { puntos: 2, elo: 1850 }),
      jugador("cola1", { puntos: 0, elo: 1700 }),
      jugador("cola2", { puntos: 0, elo: 1650 }),
    ];
    const r = emparejarSuizo(jugadores, 3);
    const cruces = r.emparejamientos.map((e) => [e.blancas, e.negras].sort().join("-"));
    expect(cruces).toContain("lider1-lider2");
    expect(cruces).toContain("cola1-cola2");
  });

  it("no repite un enfrentamiento ya jugado si puede evitarlo", () => {
    const jugadores = [
      jugador("a", { rivales: ["b"] }),
      jugador("b", { rivales: ["a"] }),
      jugador("c", { rivales: ["d"] }),
      jugador("d", { rivales: ["c"] }),
    ];
    const r = emparejarSuizo(jugadores, 2);
    const cruces = r.emparejamientos.map((e) => [e.blancas, e.negras].sort().join("-"));
    expect(cruces).not.toContain("a-b");
    expect(cruces).not.toContain("c-d");
    expect(r.repeticiones).toHaveLength(0);
  });

  it("antes repite rival que dejar a alguien sin partida", () => {
    // Dos jugadores que ya se enfrentaron: no hay alternativa posible.
    const jugadores = [
      jugador("a", { rivales: ["b"] }),
      jugador("b", { rivales: ["a"] }),
    ];
    const r = emparejarSuizo(jugadores, 2);
    expect(r.emparejamientos).toHaveLength(1);
    expect(r.repeticiones).toHaveLength(1);
  });

  it("con impares descansa uno, y rota entre quienes no han descansado", () => {
    const jugadores = [
      jugador("a", { puntos: 3 }),
      jugador("b", { puntos: 2 }),
      jugador("c", { puntos: 1 }),
      jugador("d", { puntos: 0, haDescansado: true }),
      jugador("e", { puntos: 0 }),
    ];
    const r = emparejarSuizo(jugadores, 4);
    // El último de la tabla que NO ha descansado todavía: "e" está por debajo de
    // "d" al ordenar por ELO/ficha, pero "d" ya descansó.
    expect(r.descansa).toBe("e");
    expect(r.emparejamientos).toHaveLength(2);
    const enJuego = r.emparejamientos.flatMap((x) => [x.blancas, x.negras]);
    expect(enJuego).not.toContain("e");
  });

  it("si todos han descansado ya, descansa el último de la tabla", () => {
    const jugadores = ["a", "b", "c"].map((f, i) =>
      jugador(f, { puntos: 3 - i, haDescansado: true })
    );
    expect(emparejarSuizo(jugadores, 4).descansa).toBe("c");
  });

  it("equilibra los colores entre rondas", () => {
    const jugadores = [
      jugador("a", { colores: ["blancas", "blancas"] }),
      jugador("b", { colores: ["negras", "negras"] }),
    ];
    const r = emparejarSuizo(jugadores, 3);
    expect(r.emparejamientos[0]).toEqual({ blancas: "b", negras: "a" });
  });

  it("es determinista con la misma entrada", () => {
    const hacer = () =>
      emparejarSuizo(
        [
          jugador("a", { puntos: 1, elo: 1800 }),
          jugador("b", { puntos: 1, elo: 1800 }),
          jugador("c", { puntos: 0, elo: 1800 }),
          jugador("d", { puntos: 0, elo: 1800 }),
        ],
        2
      );
    expect(hacer()).toEqual(hacer());
  });

  it("sin jugadores no hay emparejamientos", () => {
    const r = emparejarSuizo([], 1);
    expect(r.emparejamientos).toEqual([]);
    expect(r.descansa).toBeNull();
  });

  it("un solo jugador descansa y no juega", () => {
    const r = emparejarSuizo([jugador("a")], 1);
    expect(r.descansa).toBe("a");
    expect(r.emparejamientos).toEqual([]);
  });
});

describe("rondasRecomendadas", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 3],
    [8, 3],
    [16, 4],
    [40, 6],
  ])("con %i jugadores, %i rondas", (jugadores, esperado) => {
    expect(rondasRecomendadas(jugadores)).toBe(esperado);
  });
});
