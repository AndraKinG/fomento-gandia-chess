import { describe, expect, it } from "vitest";
import { validarContexto } from "./contexto";
import type { ConfigEquipo, ContextoClub, JugadorOrden, TableroPropuesto } from "./tipos";

/** Construye un JugadorOrden de prueba: por defecto la fuerza decrece con el
 * número, así que el índice en el orden ordenado coincide con numero - 1
 * (sin bises), lo que simplifica el cálculo manual de bloques en los tests. */
function j(numero: number, opts: Partial<Pick<JugadorOrden, "bisIndex" | "nombre" | "fuerza">> = {}): JugadorOrden {
  const bisIndex = opts.bisIndex ?? 0;
  const suffix = bisIndex > 0 ? `bis${bisIndex}` : "";
  return {
    playerId: `p${numero}${suffix}`,
    nombre: opts.nombre ?? `Jugador${numero}${suffix}`,
    numero,
    bisIndex,
    fuerza: opts.fuerza ?? 3000 - numero * 10,
    excepcionMargen: false,
  };
}

function t(tablero: number, playerId: string): TableroPropuesto {
  return { tablero, playerId };
}

function cfg(margenElo: number | null, numTableros = 8, permitirInversionDentroMargen = true): ConfigEquipo {
  return { margenElo, numTableros, permitirInversionDentroMargen };
}

/** Club de 3 equipos a 8 tableros cada uno (24 titulares), orden 1..30 sin bises. */
function clubTresEquipos(): JugadorOrden[] {
  return Array.from({ length: 30 }, (_, i) => j(i + 1));
}

function ctxBase(overrides: Partial<ContextoClub> = {}): ContextoClub {
  return {
    equipoIndice: 0,
    totalEquipos: 3,
    numTablerosPorEquipo: [8, 8, 8],
    esDivisionAutonomica: [false, false, false],
    alineacionesMismaFecha: [],
    mismaSede: [],
    vecesEnSuperior: {},
    rondasJugadasEquipoOrigen: 0,
    ...overrides,
  };
}

describe("validarContexto — R3 bloques de titulares (art. 51.1/51.4)", () => {
  it("titular del equipo A (nº3) alineado en el equipo B es error 51.1", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p3")];
    const ctx = ctxBase({ equipoIndice: 1 });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    const err = infs.find((i) => i.articulo === "51.1");
    expect(err).toBeDefined();
    expect(err!.nivel).toBe("error");
    expect(err!.mensaje).toContain("Jugador3");
  });

  it("titular del equipo B (nº10) alineado en el equipo A (subir) NO es error", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")];
    const ctx = ctxBase({ equipoIndice: 0 });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.1")).toBe(false);
  });

  it("titular del propio equipo (nº2 en el A) no genera error 51.1", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p2")];
    const ctx = ctxBase({ equipoIndice: 0 });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.1")).toBe(false);
  });
});

describe("validarContexto — R4 límites autonómicos (art. 51.5.c)", () => {
  it("nº20 en el equipo A autonómico es error 51.5.c (>18)", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p20")];
    const ctx = ctxBase({ equipoIndice: 0, esDivisionAutonomica: [true, true, true] });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(true);
  });

  it("nº20 en el equipo A NO autonómico no genera error 51.5.c", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p20")];
    const ctx = ctxBase({ equipoIndice: 0, esDivisionAutonomica: [false, false, false] });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(false);
  });

  it("nº19 en el equipo B (3 equipos, autonómico) NO genera error 51.5.c", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p19")];
    const ctx = ctxBase({ equipoIndice: 1, esDivisionAutonomica: [true, true, true] });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(false);
  });

  it("nº29 en el equipo B (3 equipos, autonómico) es error 51.5.c", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p29")];
    const ctx = ctxBase({ equipoIndice: 1, esDivisionAutonomica: [true, true, true] });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(true);
  });

  it("nº29 en el equipo B con SOLO dos equipos NO genera error (sin límite superior)", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p29")];
    const ctx = ctxBase({
      equipoIndice: 1,
      totalEquipos: 2,
      numTablerosPorEquipo: [8, 8],
      esDivisionAutonomica: [true, true],
    });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(false);
  });
});

describe("validarContexto — R5 regla del 50% (art. 51.3)", () => {
  it("aviso preventivo en el límite exacto: titular de B jugando en A, 2 de 4 rondas (50%)", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")]; // p10 titular de B (bloque 1)
    const ctx = ctxBase({
      equipoIndice: 0, // se alinea arriba, en el A
      vecesEnSuperior: { p10: 1 },
      rondasJugadasEquipoOrigen: 4,
    });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    const av = infs.find((i) => i.articulo === "51.3" && i.nivel === "aviso");
    expect(av).toBeDefined();
    expect(av!.mensaje).toContain("Jugador10");
  });

  it("por debajo del límite (1 de 4 rondas) NO genera aviso 51.3", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")];
    const ctx = ctxBase({
      equipoIndice: 0,
      vecesEnSuperior: { p10: 0 },
      rondasJugadasEquipoOrigen: 4,
    });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.3")).toBe(false);
  });

  it("error 51.3: jugador ya bloqueado (2 de 4 rondas) alineado de vuelta en su equipo de origen (B)", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")]; // p10 titular de B, alineado en el propio B
    const ctx = ctxBase({
      equipoIndice: 1,
      vecesEnSuperior: { p10: 2 },
      rondasJugadasEquipoOrigen: 4,
    });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    const err = infs.find((i) => i.articulo === "51.3" && i.nivel === "error");
    expect(err).toBeDefined();
    expect(err!.mensaje).toContain("Jugador10");
  });

  it("sin llegar al bloqueo (1 de 4 rondas) alineado en su equipo de origen NO es error", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")];
    const ctx = ctxBase({
      equipoIndice: 1,
      vecesEnSuperior: { p10: 1 },
      rondasJugadasEquipoOrigen: 4,
    });
    const infs = validarContexto(orden, alineacion, cfg(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.3")).toBe(false);
  });
});

describe("validarContexto — R7 misma fecha (arts. 54-55)", () => {
  it("jugador presente en la convocatoria de otro equipo la misma fecha es error, en AMBAS direcciones", () => {
    const orden = clubTresEquipos();

    // Perspectiva del equipo A: p5 también convocado por el B.
    const infsA = validarContexto(
      orden,
      [t(1, "p5")],
      cfg(null, 8),
      ctxBase({ equipoIndice: 0, alineacionesMismaFecha: [{ equipoIndice: 1, playerIds: ["p5"] }] })
    );
    expect(infsA.some((i) => i.articulo === "54/55")).toBe(true);

    // Perspectiva del equipo B: mismo jugador, misma fecha, dirección inversa.
    const infsB = validarContexto(
      orden,
      [t(1, "p5")],
      cfg(null, 8),
      ctxBase({ equipoIndice: 1, alineacionesMismaFecha: [{ equipoIndice: 0, playerIds: ["p5"] }] })
    );
    expect(infsB.some((i) => i.articulo === "54/55")).toBe(true);
  });

  it("sin coincidencia de jugadores en otras convocatorias, no genera error 54/55", () => {
    const orden = clubTresEquipos();
    const infs = validarContexto(
      orden,
      [t(1, "p5")],
      cfg(null, 8),
      ctxBase({ equipoIndice: 0, alineacionesMismaFecha: [{ equipoIndice: 1, playerIds: ["p6"] }] })
    );
    expect(infs.some((i) => i.articulo === "54/55")).toBe(false);
  });
});

describe("validarContexto — R8 misma sede (art. 52.4)", () => {
  it("misma sede con inversión ilegal cruzada (equipo local coloca a un titular fuerte muy abajo) es error 52.4", () => {
    // Club pequeño: nº1 (fuerte) es titular del B; nº10 y nº11 son titulares
    // del A (peor orden que nº1, situación atípica pero válida a efectos del
    // test: lo relevant es la comparación cruzada de posiciones).
    const orden = [j(1), j(10), j(11)];

    // Equipo A juega tablero 1 y 2 con nº10 y nº11 (orden interno correcto).
    const alineacionEquipoA: TableroPropuesto[] = [t(1, "p10"), t(2, "p11")];
    // Equipo B (el que validamos) alinea a nº1 en su tablero 1: al combinar
    // ambas alineaciones "como un solo equipo" (art. 52.4), nº1 queda DETRÁS
    // de nº10 y nº11 pese a tener mejor orden de fuerza: inversión ilegal.
    const alineacionEquipoB: TableroPropuesto[] = [t(1, "p1")];

    const ctx = ctxBase({
      equipoIndice: 1,
      numTablerosPorEquipo: [2, 2],
      totalEquipos: 2,
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfg(null, 2) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfg(null, 2), ctx);
    const errores52_4 = infs.filter((i) => i.articulo === "52.4");
    expect(errores52_4.length).toBeGreaterThan(0);
    expect(errores52_4.every((i) => i.nivel === "error")).toBe(true);
  });

  it("misma sede sin infracción cruzada no genera errores 52.4", () => {
    const orden = [j(1), j(2), j(10)];
    const alineacionEquipoA: TableroPropuesto[] = [t(1, "p1"), t(2, "p2")];
    const alineacionEquipoB: TableroPropuesto[] = [t(1, "p10")];

    const ctx = ctxBase({
      equipoIndice: 1,
      numTablerosPorEquipo: [2, 2],
      totalEquipos: 2,
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfg(null, 2) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfg(null, 2), ctx);
    expect(infs.some((i) => i.articulo === "52.4")).toBe(false);
  });

  it("sin equipos en mismaSede, no se ejecuta ninguna comprobación 52.4", () => {
    const orden = [j(1), j(2)];
    const infs = validarContexto(orden, [t(1, "p2"), t(2, "p1")], cfg(null, 2), ctxBase({ equipoIndice: 0, mismaSede: [] }));
    expect(infs.some((i) => i.articulo === "52.4")).toBe(false);
  });
});
