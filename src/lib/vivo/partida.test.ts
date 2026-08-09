import { describe, expect, it } from "vitest";
import {
  aPgn,
  aplicarJugada,
  finPorAbandono,
  finPorReglas,
  finPorTiempo,
  partidaNueva,
  posicionDe,
  reclamarTiempo,
  type Estado,
} from "./partida";
import { relojInicial, type Cadencia } from "./reloj";

const CADENCIA: Cadencia = { baseMs: 5 * 60_000, incrementoMs: 3_000 };
const T0 = 1_000_000;

/** Partida ya empezada, con el reloj corriendo desde T0. */
function enJuego(jugadas: string[] = [], turno: "w" | "b" = "w"): Estado {
  return {
    ...partidaNueva(CADENCIA, { ...relojInicial(CADENCIA), ultimaJugadaEn: T0, turno }),
    jugadas,
  };
}

describe("aplicarJugada", () => {
  it("acepta una jugada legal y devuelve su notación", () => {
    const r = aplicarJugada(enJuego(), "w", { desde: "e2", hasta: "e4" }, T0 + 5_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.san).toBe("e4");
    expect(r.estado.jugadas).toEqual(["e4"]);
    expect(r.estado.reloj.turno).toBe("b");
  });

  it("rechaza una jugada ilegal", () => {
    const r = aplicarJugada(enJuego(), "w", { desde: "e2", hasta: "e5" }, T0 + 1_000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("no es legal");
  });

  it("rechaza mover cuando no es tu turno", () => {
    // Sin esto, cualquiera podría mover dos veces seguidas o mover por el rival.
    const r = aplicarJugada(enJuego(), "b", { desde: "e7", hasta: "e5" }, T0 + 1_000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("turno");
  });

  it("no deja mover en una partida ya terminada", () => {
    // Una jugada que llega tarde no puede revivir una partida cerrada.
    const acabada: Estado = { ...enJuego(), resultado: "1-0", motivo: "abandono" };
    expect(aplicarJugada(acabada, "w", { desde: "e2", hasta: "e4" }, T0).ok).toBe(false);
  });

  it("la bandera se mira ANTES que la jugada", () => {
    // Si el tiempo se acabó mientras pensaba, la partida ya estaba perdida: dejar
    // pasar la jugada premiaría a quien tarda de más en mandarla.
    const r = aplicarJugada(enJuego(), "w", { desde: "e2", hasta: "e4" }, T0 + 400_000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.estado?.resultado).toBe("0-1");
    expect(r.estado?.motivo).toBe("tiempo");
  });

  it("descuenta el tiempo de quien mueve", () => {
    const r = aplicarJugada(enJuego(), "w", { desde: "e2", hasta: "e4" }, T0 + 10_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.reloj.blancasMs).toBe(293_000);
    expect(r.estado.reloj.negrasMs).toBe(300_000);
  });

  it("corona cuando se le dice a qué", () => {
    // El peón de a llega a a7 y corona capturando el caballo de b8.
    const antes = enJuego(["a4", "b5", "axb5", "a6", "bxa6", "Nf6", "a7", "Ng8"], "w");
    const r = aplicarJugada(antes, "w", { desde: "a7", hasta: "b8", corona: "q" }, T0 + 1_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.san).toContain("=Q");
  });

  it("detecta el mate y lo apunta como tal", () => {
    // Mate del pastor: gana quien acaba de mover.
    const antes = enJuego(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"], "w");
    const r = aplicarJugada(antes, "w", { desde: "h5", hasta: "f7" }, T0 + 1_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.resultado).toBe("1-0");
    expect(r.estado.motivo).toBe("mate");
  });

  it("detecta el mate pastor de las negras como 0-1", () => {
    const antes = enJuego(["f3", "e5", "g4"], "b");
    const r = aplicarJugada(antes, "b", { desde: "d8", hasta: "h4" }, T0 + 1_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.resultado).toBe("0-1");
  });
});

describe("finPorReglas", () => {
  it("un ahogado son tablas sin que nadie las reclame", () => {
    // En un club nadie reclama la regla; una partida que sigue tras un ahogado es
    // un error que acaba en el acta.
    const c = posicionDe([]);
    c.load("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(finPorReglas(c)).toEqual({ resultado: "1/2-1/2", motivo: "ahogado" });
  });

  it("rey contra rey son tablas por material", () => {
    const c = posicionDe([]);
    c.load("7k/8/6K1/8/8/8/8/8 w - - 0 1");
    expect(finPorReglas(c)?.motivo).toBe("material-insuficiente");
  });

  it("una posición normal no está acabada", () => {
    expect(finPorReglas(posicionDe(["e4", "e5"]))).toBeNull();
  });
});

describe("finPorTiempo y finPorAbandono", () => {
  it("gana el rival del que se queda sin tiempo", () => {
    expect(finPorTiempo("w")).toEqual({ resultado: "0-1", motivo: "tiempo" });
    expect(finPorTiempo("b")).toEqual({ resultado: "1-0", motivo: "tiempo" });
  });

  it("gana el rival del que abandona", () => {
    expect(finPorAbandono("b")).toEqual({ resultado: "1-0", motivo: "abandono" });
  });
});

describe("reclamarTiempo", () => {
  it("cierra la partida si la bandera está caída", () => {
    // Sin esto, si el rival se va la partida se queda abierta para siempre: nadie
    // manda ninguna jugada que dispare la comprobación.
    const cerrada = reclamarTiempo(enJuego(), T0 + 400_000);
    expect(cerrada?.resultado).toBe("0-1");
    expect(cerrada?.motivo).toBe("tiempo");
  });

  it("deja el reloj del que pierde a cero y parado", () => {
    // Si no se para, la fila conserva los 5:00 de la última jugada y el tablero
    // final enseña tiempo de sobra a quien acaba de perder por bandera.
    const cerrada = reclamarTiempo(enJuego(), T0 + 400_000);
    expect(cerrada?.reloj.blancasMs).toBe(0);
    expect(cerrada?.reloj.ultimaJugadaEn).toBeNull();
  });

  it("no cierra nada si aún queda tiempo", () => {
    // Reclamar no basta: se comprueba de verdad.
    expect(reclamarTiempo(enJuego(), T0 + 10_000)).toBeNull();
  });

  it("no toca una partida ya terminada", () => {
    const acabada: Estado = { ...enJuego(), resultado: "1-0", motivo: "mate" };
    expect(reclamarTiempo(acabada, T0 + 400_000)).toBeNull();
  });
});

describe("aPgn", () => {
  const datos = { blancas: "Joan Martínez Ribes", negras: "Emilio Briz", fecha: "2026-08-08" };

  it("monta cabeceras y jugadas numeradas", () => {
    const e: Estado = { ...enJuego(["e4", "e5", "Nf3"]), resultado: "1-0", motivo: "mate" };
    const pgn = aPgn(e, datos);
    expect(pgn).toContain('[White "Joan Martínez Ribes"]');
    expect(pgn).toContain('[Date "2026.08.08"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain("1. e4 e5 2. Nf3 1-0");
  });

  it("una partida sin acabar lleva asterisco", () => {
    expect(aPgn(enJuego(["e4"]), datos)).toContain('[Result "*"]');
  });

  it("lo que sale se puede volver a leer", () => {
    // Es lo que va a acabar en el repositorio: si no se puede releer, no sirve.
    const e: Estado = { ...enJuego(["e4", "e5", "Nf3", "Nc6"]), resultado: "1/2-1/2", motivo: "tablas-acordadas" };
    const c = posicionDe([]);
    c.loadPgn(aPgn(e, datos));
    expect(c.history()).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });
});
