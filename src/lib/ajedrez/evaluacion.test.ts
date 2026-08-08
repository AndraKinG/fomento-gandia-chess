import { describe, expect, it } from "vitest";
import {
  desdeLasBlancas,
  leerInfo,
  lineaNumerada,
  porcentajeBarra,
  pvEnJugadas,
  textoPuntuacion,
} from "./evaluacion";

const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("leerInfo", () => {
  it("lee profundidad, puntuación y línea", () => {
    const r = leerInfo(
      "info depth 18 seldepth 24 multipv 1 score cp 34 nodes 1234 nps 100 time 12 pv e2e4 e7e5 g1f3"
    );
    expect(r).toEqual({
      profundidad: 18,
      puntuacion: { tipo: "cp", valor: 34 },
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("lee un mate", () => {
    expect(leerInfo("info depth 12 score mate -3 pv e1e2")?.puntuacion).toEqual({
      tipo: "mate",
      valor: -3,
    });
  });

  it("descarta las líneas de servicio, que no traen puntuación", () => {
    // El motor escupe muchísimas y ninguna vale para evaluar.
    expect(leerInfo("info string NNUE evaluation using nn-9067e33176e")).toBeNull();
    expect(leerInfo("info depth 5 currmove e2e4 currmovenumber 1")).toBeNull();
  });

  it("descarta las evaluaciones a medias", () => {
    // Con `upperbound` el motor solo sabe que está por debajo de eso; enseñarla
    // hace bailar el número mientras piensa.
    expect(leerInfo("info depth 10 score cp 50 upperbound pv e2e4")).toBeNull();
  });

  it("descarta lo que no es una línea de info", () => {
    expect(leerInfo("bestmove e2e4 ponder e7e5")).toBeNull();
    expect(leerInfo("readyok")).toBeNull();
  });

  it("aguanta una info sin línea principal", () => {
    expect(leerInfo("info depth 1 score cp 20")?.pv).toEqual([]);
  });
});

describe("desdeLasBlancas", () => {
  it("deja la puntuación igual si mueven las blancas", () => {
    expect(desdeLasBlancas({ tipo: "cp", valor: 34 }, "w")).toEqual({
      tipo: "cp",
      valor: 34,
    });
  });

  it("le da la vuelta si mueven las negras", () => {
    // UCI puntúa SIEMPRE desde quien mueve: sin esto, una ventaja de las negras
    // saldría en la barra como ventaja de las blancas.
    expect(desdeLasBlancas({ tipo: "cp", valor: 120 }, "b")).toEqual({
      tipo: "cp",
      valor: -120,
    });
    expect(desdeLasBlancas({ tipo: "mate", valor: 2 }, "b")).toEqual({
      tipo: "mate",
      valor: -2,
    });
  });
});

describe("textoPuntuacion", () => {
  it("pasa de centipeones a peones con dos decimales", () => {
    expect(textoPuntuacion({ tipo: "cp", valor: 34 })).toBe("+0.34");
    expect(textoPuntuacion({ tipo: "cp", valor: -250 })).toBe("−2.50");
  });

  it("pone el signo también en la igualdad", () => {
    // Un "0.00" pelado se lee como "no hay dato".
    expect(textoPuntuacion({ tipo: "cp", valor: 0 })).toBe("+0.00");
  });

  it("escribe los mates", () => {
    expect(textoPuntuacion({ tipo: "mate", valor: 3 })).toBe("+M3");
    expect(textoPuntuacion({ tipo: "mate", valor: -1 })).toBe("−M1");
  });

  it("mate 0 es que ya está dado", () => {
    expect(textoPuntuacion({ tipo: "mate", valor: 0 })).toBe("Mate");
  });
});

describe("porcentajeBarra", () => {
  it("la igualdad parte la barra por la mitad", () => {
    expect(porcentajeBarra({ tipo: "cp", valor: 0 })).toBe(50);
  });

  it("un mate llena la barra del lado que lo da", () => {
    expect(porcentajeBarra({ tipo: "mate", valor: 2 })).toBe(100);
    expect(porcentajeBarra({ tipo: "mate", valor: -2 })).toBe(0);
  });

  it("crece con la ventaja pero nunca se sale", () => {
    const medio = porcentajeBarra({ tipo: "cp", valor: 100 });
    const mucho = porcentajeBarra({ tipo: "cp", valor: 900 });
    expect(medio).toBeGreaterThan(50);
    expect(mucho).toBeGreaterThan(medio);
    expect(mucho).toBeLessThanOrEqual(100);
  });

  it("aplana las ventajas enormes", () => {
    // De +8 a +9 no cambia la partida, ya está ganada: la barra no debe seguir
    // moviéndose como si fuera lineal.
    const ocho = porcentajeBarra({ tipo: "cp", valor: 800 });
    const nueve = porcentajeBarra({ tipo: "cp", valor: 900 });
    expect(nueve - ocho).toBeLessThan(2);
  });
});

describe("pvEnJugadas", () => {
  it("traduce las casillas del motor a jugadas de verdad", () => {
    expect(pvEnJugadas(INICIAL, ["e2e4", "e7e5", "g1f3"])).toEqual(["e4", "e5", "Nf3"]);
  });

  it("respeta el tope", () => {
    expect(pvEnJugadas(INICIAL, ["e2e4", "e7e5", "g1f3"], 2)).toEqual(["e4", "e5"]);
  });

  it("se para en la primera imposible en vez de reventar", () => {
    // La línea llega mientras el motor sigue pensando y puede venir cortada.
    expect(pvEnJugadas(INICIAL, ["e2e4", "a1a8"])).toEqual(["e4"]);
  });

  it("una línea vacía no da nada", () => {
    expect(pvEnJugadas(INICIAL, [])).toEqual([]);
  });
});

describe("lineaNumerada", () => {
  it("numera desde las blancas", () => {
    expect(lineaNumerada(["e4", "e5", "Nf3"], 1, "w")).toBe("1. e4 e5 2. Nf3");
  });

  it("empezando por las negras pone los puntos suspensivos", () => {
    // Sin ellos, la línea parece empezar en la jugada equivocada.
    expect(lineaNumerada(["Bc5", "d4"], 12, "b")).toBe("12... Bc5 13. d4");
  });

  it("una sola jugada de las blancas", () => {
    expect(lineaNumerada(["Qxf7"], 20, "w")).toBe("20. Qxf7");
  });

  it("sin jugadas no escribe nada", () => {
    expect(lineaNumerada([], 5, "w")).toBe("");
  });
});
