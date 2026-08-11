import { describe, expect, it } from "vitest";
import {
  diaYHora,
  horaCorta,
  minutosHasta,
  textoCuentaAtras,
  tocaAvisar,
  tocaLaTarjeta,
} from "./hora-de-ronda";

/** Las 19:00 de Madrid del miércoles 19 de agosto de 2026 (verano: UTC+2). */
const RONDA = "2026-08-19T17:00:00Z";

function ahoraA(iso: string): Date {
  return new Date(iso);
}

describe("minutosHasta", () => {
  it("cuenta hacia delante y hacia atrás", () => {
    expect(minutosHasta(RONDA, ahoraA("2026-08-19T16:00:00Z"))).toBe(60);
    expect(minutosHasta(RONDA, ahoraA("2026-08-19T17:10:00Z"))).toBe(-10);
  });

  it("una fecha que no vale no revienta", () => {
    expect(minutosHasta("no-es-una-fecha", ahoraA(RONDA))).toBeNaN();
  });
});

describe("tocaAvisar", () => {
  const sinAvisar = { fechaHora: RONDA, avisoEnviadoEn: null };

  it("justo una hora antes, sí", () => {
    expect(tocaAvisar(sinAvisar, ahoraA("2026-08-19T16:00:00Z"))).toBe(true);
  });

  it("una hora y un minuto antes, todavía no", () => {
    expect(tocaAvisar(sinAvisar, ahoraA("2026-08-19T15:59:00Z"))).toBe(false);
  });

  it("dentro de la última hora, sí: el programador pasa cada cinco minutos", () => {
    // Si una pasada falla, la siguiente tiene que poder recoger el aviso.
    expect(tocaAvisar(sinAvisar, ahoraA("2026-08-19T16:55:00Z"))).toBe(true);
  });

  it("pasada la hora, NO", () => {
    // "Empieza en una hora" llegando cuando ya ha empezado es peor que no avisar.
    expect(tocaAvisar(sinAvisar, ahoraA("2026-08-19T17:01:00Z"))).toBe(false);
  });

  it("con la marca puesta, no se repite", () => {
    // La marca la pone el servidor ANTES de enviar: dos pasadas solapadas no
    // pueden mandar el mismo aviso dos veces.
    expect(
      tocaAvisar(
        { fechaHora: RONDA, avisoEnviadoEn: "2026-08-19T16:00:00Z" },
        ahoraA("2026-08-19T16:30:00Z")
      )
    ).toBe(false);
  });

  it("sin hora no hay nada que avisar", () => {
    expect(tocaAvisar({ fechaHora: null, avisoEnviadoEn: null }, ahoraA(RONDA))).toBe(false);
  });
});

describe("tocaLaTarjeta", () => {
  it("la última hora antes, sí", () => {
    expect(tocaLaTarjeta(RONDA, ahoraA("2026-08-19T16:30:00Z"))).toBe(true);
  });

  it("antes de esa hora, no estorba", () => {
    expect(tocaLaTarjeta(RONDA, ahoraA("2026-08-19T14:00:00Z"))).toBe(false);
  });

  it("sigue un rato DESPUÉS de la hora, al revés que el push", () => {
    // Quien abre la app a las 19:05 es justo quien necesita el enlace.
    expect(tocaLaTarjeta(RONDA, ahoraA("2026-08-19T17:20:00Z"))).toBe(true);
  });

  it("pero no para siempre", () => {
    expect(tocaLaTarjeta(RONDA, ahoraA("2026-08-19T17:31:00Z"))).toBe(false);
  });

  it("sin hora, ninguna tarjeta", () => {
    expect(tocaLaTarjeta(null, ahoraA(RONDA))).toBe(false);
  });
});

describe("textoCuentaAtras", () => {
  it("dice los minutos que faltan", () => {
    expect(textoCuentaAtras(43)).toBe("Empieza en 43 min");
    expect(textoCuentaAtras(1)).toBe("Empieza en 1 minuto");
    expect(textoCuentaAtras(60)).toBe("Empieza en 1 h");
  });

  it("pasada la hora lo dice, no cuenta en negativo", () => {
    expect(textoCuentaAtras(0)).toBe("Ya ha empezado");
    expect(textoCuentaAtras(-12)).toBe("Ya ha empezado");
  });
});

describe("horaCorta y diaYHora", () => {
  it("en hora de Madrid, no en la del servidor", () => {
    // El push lo escribe Vercel, que corre en UTC: sin la zona explícita un torneo
    // de las 19:00 se anunciaría a las 17:00.
    expect(horaCorta(RONDA)).toBe("19:00");
    expect(diaYHora(RONDA)).toContain("19:00");
  });

  it("en invierno también (UTC+1)", () => {
    expect(horaCorta("2026-01-14T18:00:00Z")).toBe("19:00");
  });
});
