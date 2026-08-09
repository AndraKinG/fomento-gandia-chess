import { describe, expect, it } from "vitest";
import {
  banderaCaida,
  enReloj,
  paraPintar,
  relojInicial,
  restanteDeQuienMueve,
  trasJugada,
  type Cadencia,
  type Reloj,
} from "./reloj";

/** 5 minutos con 3 segundos de incremento, que es lo típico de un rápidas de club. */
const CADENCIA: Cadencia = { baseMs: 5 * 60_000, incrementoMs: 3_000 };
const T0 = 1_000_000;

describe("relojInicial", () => {
  it("reparte la base a los dos y no arranca hasta la primera jugada", () => {
    const r = relojInicial(CADENCIA);
    expect(r.blancasMs).toBe(300_000);
    expect(r.negrasMs).toBe(300_000);
    expect(r.ultimaJugadaEn).toBeNull();
    expect(r.turno).toBe("w");
  });
});

describe("restanteDeQuienMueve", () => {
  it("antes de la primera jugada nadie gasta tiempo", () => {
    // Si no, quien abre la partida perdería mientras espera a que el rival entre.
    const r = relojInicial(CADENCIA);
    expect(restanteDeQuienMueve(r, T0 + 600_000)).toBe(300_000);
  });

  it("descuenta lo que lleva pensando quien tiene el turno", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    expect(restanteDeQuienMueve(r, T0 + 10_000)).toBe(290_000);
  });

  it("no devuelve números negativos", () => {
    // Un "-4:12" en pantalla no significa nada.
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    expect(restanteDeQuienMueve(r, T0 + 400_000)).toBe(0);
  });

  it("no toca el reloj del que espera", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0, turno: "b" as const };
    expect(restanteDeQuienMueve(r, T0 + 10_000)).toBe(290_000);
    expect(r.blancasMs).toBe(300_000);
  });
});

describe("banderaCaida", () => {
  it("no cae mientras quede tiempo", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    expect(banderaCaida(r, T0 + 299_999)).toBe(false);
  });

  it("cae justo al llegar a cero", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    expect(banderaCaida(r, T0 + 300_000)).toBe(true);
  });

  it("no cae antes de empezar por mucho que se tarde", () => {
    expect(banderaCaida(relojInicial(CADENCIA), T0 + 10_000_000)).toBe(false);
  });
});

describe("trasJugada", () => {
  it("descuenta lo pensado y suma el incremento", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    const d = trasJugada(r, CADENCIA, T0 + 10_000);
    expect(d.blancasMs).toBe(293_000); // 300 − 10 + 3
  });

  it("pasa el turno y deja la marca de tiempo", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    const d = trasJugada(r, CADENCIA, T0 + 10_000);
    expect(d.turno).toBe("b");
    expect(d.ultimaJugadaEn).toBe(T0 + 10_000);
  });

  it("la primera jugada ni descuenta ni suma", () => {
    // El reloj no ha arrancado, así que no se ha gastado nada: sumar el incremento
    // dejaba a las blancas con más tiempo del que empezaron, y eso se lee como un
    // error aunque el reloj vaya bien.
    const d = trasJugada(relojInicial(CADENCIA), CADENCIA, T0);
    expect(d.blancasMs).toBe(300_000);
  });

  it("la segunda jugada ya suma normal", () => {
    let r: Reloj = relojInicial(CADENCIA);
    r = trasJugada(r, CADENCIA, T0); // blancas abren, sin descuento ni incremento
    r = trasJugada(r, CADENCIA, T0 + 10_000); // negras piensan 10 s
    expect(r.negrasMs).toBe(293_000);
  });

  it("NO regala incremento a quien ya se quedó a cero", () => {
    // Sumarlo antes de descontar dejaría mover a quien ya había perdido por tiempo.
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    const d = trasJugada(r, CADENCIA, T0 + 400_000);
    expect(d.blancasMs).toBe(0);
  });

  it("no toca el reloj del rival", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    expect(trasJugada(r, CADENCIA, T0 + 10_000).negrasMs).toBe(300_000);
  });

  it("dos jugadas seguidas descuentan a cada uno lo suyo", () => {
    // Anotado: el objeto de partida infiere `ultimaJugadaEn: number` y `trasJugada`
    // devuelve el tipo bueno, que la admite nula.
    let r: Reloj = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    r = trasJugada(r, CADENCIA, T0 + 10_000); // blancas piensan 10 s
    r = trasJugada(r, CADENCIA, T0 + 40_000); // negras piensan 30 s
    expect(r.blancasMs).toBe(293_000);
    expect(r.negrasMs).toBe(273_000);
    expect(r.turno).toBe("w");
  });

  it("una cadencia sin incremento solo resta", () => {
    const sinIncremento: Cadencia = { baseMs: 60_000, incrementoMs: 0 };
    const r = { ...relojInicial(sinIncremento), ultimaJugadaEn: T0 };
    expect(trasJugada(r, sinIncremento, T0 + 5_000).blancasMs).toBe(55_000);
  });
});

describe("paraPintar", () => {
  it("descuenta solo al que mueve", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0 };
    expect(paraPintar(r, T0 + 15_000)).toEqual({ blancasMs: 285_000, negrasMs: 300_000 });
  });

  it("con las negras en juego, descuenta a las negras", () => {
    const r = { ...relojInicial(CADENCIA), ultimaJugadaEn: T0, turno: "b" as const };
    expect(paraPintar(r, T0 + 15_000)).toEqual({ blancasMs: 300_000, negrasMs: 285_000 });
  });
});

describe("enReloj", () => {
  it("escribe minutos y segundos", () => {
    expect(enReloj(300_000)).toBe("5:00");
    expect(enReloj(65_000)).toBe("1:05");
  });

  it("saca las décimas en el último medio minuto", () => {
    // Durante la partida parpadear décimas es ruido; al final es lo que se mira.
    expect(enReloj(29_900)).toBe("0:29.9");
    expect(enReloj(1_500)).toBe("0:01.5");
  });

  it("justo en el medio minuto todavía no las saca", () => {
    expect(enReloj(30_000)).toBe("0:30");
  });

  it("cero es cero, y un negativo también", () => {
    expect(enReloj(0)).toBe("0:00.0");
    expect(enReloj(-5_000)).toBe("0:00.0");
  });
});
