import { describe, expect, it } from "vitest";
import {
  aPgn,
  aplicarJugada,
  finPorAbandono,
  finPorReglas,
  finPorTiempo,
  partidaNueva,
  abandonadaPorTiempo,
  destinoDeAbandonada,
  MARGEN_ABANDONO_MS,
  posicionDe,
  reclamarTiempo,
  volverJugada,
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

  it("si la bandera cae al mover, el reloj queda PARADO y a cero", () => {
    // Igual que al reclamar (`reclamarTiempo`): sin parar el reloj, la fila se quedaba
    // con los 5:00 de la última jugada y el tablero final enseñaba tiempo de sobra a
    // quien acababa de perder por bandera.
    const r = aplicarJugada(enJuego(), "w", { desde: "e2", hasta: "e4" }, T0 + 400_000);
    expect(r.estado?.reloj.blancasMs).toBe(0);
    expect(r.estado?.reloj.ultimaJugadaEn).toBeNull();
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

describe("abandonadaPorTiempo", () => {
  // Bandera de las blancas: le quedan 5:00 desde T0, así que cae en T0 + 300.000.
  const CAE = T0 + 300_000;

  it("es abandonada si la bandera cayó hace más del margen", () => {
    // El caso que la motivó: dos socios se van de un reto y nadie pulsa "reclamar".
    expect(abandonadaPorTiempo(enJuego(), CAE + MARGEN_ABANDONO_MS + 1)).toBe(true);
  });

  it("no lo es mientras dura el margen, aunque la bandera ya haya caído", () => {
    // El margen es para el que SÍ está: que reclame él, sin que el cron le pise.
    expect(abandonadaPorTiempo(enJuego(), CAE + 1)).toBe(false);
    expect(abandonadaPorTiempo(enJuego(), CAE + MARGEN_ABANDONO_MS - 1)).toBe(false);
  });

  it("no lo es si a quien mueve aún le queda tiempo", () => {
    expect(abandonadaPorTiempo(enJuego(), T0 + 10_000)).toBe(false);
  });

  it("no lo es si nadie ha movido: el reloj no ha arrancado", () => {
    // Antes de la primera jugada no corre el tiempo (reloj.ts), así que una partida sin
    // jugadas no se puede cerrar por tiempo, ni a mano ni sola, por vieja que sea.
    const sinEmpezar = partidaNueva(CADENCIA, relojInicial(CADENCIA));
    expect(abandonadaPorTiempo(sinEmpezar, T0 + 30 * 86_400_000)).toBe(false);
  });

  it("no lo es si ya tiene resultado", () => {
    const acabada: Estado = { ...enJuego(), resultado: "1-0", motivo: "mate" };
    expect(abandonadaPorTiempo(acabada, CAE + MARGEN_ABANDONO_MS + 1)).toBe(false);
  });

  it("la que la motivó: el botón le da la partida a quien la reclama", () => {
    // 5+3, 1.e4 y nada más, seis días después. Si las blancas pulsan "reclamar", ganan:
    // eso no cambia. Lo que hace el CRON con ella es otra cosa (ver `destinoDeAbandonada`):
    // las negras nunca movieron, así que no llegó a empezar y se anula.
    const cadencia: Cadencia = { baseMs: 5 * 60_000, incrementoMs: 3_000 };
    const tras1e4: Estado = {
      ...partidaNueva(cadencia, {
        blancasMs: 300_000,
        negrasMs: 300_000,
        ultimaJugadaEn: T0,
        turno: "b",
      }),
      jugadas: ["e4"],
    };
    const seisDias = T0 + 6 * 86_400_000;
    expect(abandonadaPorTiempo(tras1e4, seisDias)).toBe(true);
    expect(reclamarTiempo(tras1e4, seisDias)).toMatchObject({ resultado: "1-0", motivo: "tiempo" });
  });
});

describe("destinoDeAbandonada", () => {
  // Una partida "empieza" cuando los DOS han hecho su primera jugada (regla del
  // propietario, la de Lichess): hasta entonces, abandonarla la anula.
  const ABIERTA = T0 - 10 * 86_400_000; // la mesa se abrió hace mucho: no influye si hay jugadas
  const CAE = T0 + 300_000; // con el reloj arrancado en T0, la bandera cae aquí

  it("empezada y con la bandera caída hace más del margen: se CIERRA por tiempo", () => {
    expect(destinoDeAbandonada(enJuego(["e4", "e5"]), ABIERTA, CAE + MARGEN_ABANDONO_MS + 1)).toBe("cerrar");
  });

  it("empezada pero dentro del margen: nada todavía", () => {
    expect(destinoDeAbandonada(enJuego(["e4", "e5"]), ABIERTA, CAE + 1)).toBe("nada");
  });

  it("una sola jugada y el otro no volvió: se ANULA, no se le da a nadie", () => {
    expect(destinoDeAbandonada(enJuego(["e4"], "b"), ABIERTA, CAE + MARGEN_ABANDONO_MS + 1)).toBe("anular");
  });

  it("una sola jugada pero al otro aún le queda tiempo: nada", () => {
    expect(destinoDeAbandonada(enJuego(["e4"], "b"), ABIERTA, T0 + 10_000)).toBe("nada");
  });

  it("nadie ha movido: se cuenta desde que se abrió la mesa", () => {
    // El reloj no ha arrancado, así que la referencia es la apertura: anulada cuando a
    // las blancas se les habría acabado el tiempo, más el margen.
    const sinMover = partidaNueva(CADENCIA, relojInicial(CADENCIA));
    expect(destinoDeAbandonada(sinMover, T0, T0 + 300_000 + MARGEN_ABANDONO_MS + 1)).toBe("anular");
    expect(destinoDeAbandonada(sinMover, T0, T0 + 300_000 + MARGEN_ABANDONO_MS - 1)).toBe("nada");
  });

  it("se devolvió la primera jugada y nadie siguió: se anula con el reloj que ya corría", () => {
    // Lista vacía pero el reloj arrancado: manda el reloj, no la hora de apertura.
    const devuelta: Estado = { ...enJuego([]), jugadas: [] };
    expect(destinoDeAbandonada(devuelta, ABIERTA, CAE + MARGEN_ABANDONO_MS + 1)).toBe("anular");
    expect(destinoDeAbandonada(devuelta, ABIERTA, CAE + 1)).toBe("nada");
  });

  it("con resultado: nada, la mire quien la mire", () => {
    const acabada: Estado = { ...enJuego(["e4"], "b"), resultado: "1-0", motivo: "tiempo" };
    expect(destinoDeAbandonada(acabada, ABIERTA, CAE + MARGEN_ABANDONO_MS + 1)).toBe("nada");
  });
});

describe("volverJugada", () => {
  // La pide quien hizo la última jugada; la acepta el otro, que es quien tiene el turno y
  // el reloj corriendo. En estos casos: 1.e4 en T0, y le toca a las negras.

  it("deshace la jugada y devuelve el turno a quien la pidió", () => {
    const v = volverJugada(enJuego(["e4"], "b"), T0 + 60_000);
    expect(v?.jugadas).toEqual([]);
    expect(v?.reloj.turno).toBe("w");
    expect(v?.resultado).toBeNull();
  });

  it("NO DEVUELVE el tiempo que pensó quien acepta", () => {
    // Antes se reiniciaba la marca sin descontar nada: pensar cuatro minutos y aceptar
    // salía gratis. Es lo contrario de lo que decía el propio comentario del código.
    const v = volverJugada(enJuego(["e4"], "b"), T0 + 60_000);
    expect(v?.reloj.negrasMs).toBe(300_000 - 60_000);
    expect(v?.reloj.blancasMs).toBe(300_000);
  });

  it("el reloj empieza a correrle a quien vuelve a tener el turno, desde ya", () => {
    const v = volverJugada(enJuego(["e4"], "b"), T0 + 60_000);
    expect(v?.reloj.ultimaJugadaEn).toBe(T0 + 60_000);
  });

  it("CON LA BANDERA CAÍDA no se vuelve nada: pierde por tiempo quien tenía el turno", () => {
    // El agujero: aceptar devolvía el turno al rival y la derrota desaparecía. La bandera
    // se mira ANTES, igual que en `aplicarJugada`.
    const v = volverJugada(enJuego(["e4"], "b"), T0 + 400_000);
    expect(v?.resultado).toBe("1-0");
    expect(v?.motivo).toBe("tiempo");
    expect(v?.jugadas).toEqual(["e4"]);
    expect(v?.reloj.negrasMs).toBe(0);
    expect(v?.reloj.ultimaJugadaEn).toBeNull();
  });

  it("no hace nada en una partida terminada ni sin jugadas", () => {
    const acabada: Estado = { ...enJuego(["e4"], "b"), resultado: "1-0", motivo: "mate" };
    expect(volverJugada(acabada, T0 + 60_000)).toBeNull();
    expect(volverJugada(enJuego([], "w"), T0 + 60_000)).toBeNull();
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
