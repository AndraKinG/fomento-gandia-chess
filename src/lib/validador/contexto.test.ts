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

// Minor (c): renombrado de `cfg` a `cfgPermisiva` para que la postura
// (permitirInversionDentroMargen=true por defecto) sea visible en cada call
// site sin tener que consultar la firma de la función.
function cfgPermisiva(margenElo: number | null, numTableros = 8, permitirInversionDentroMargen = true): ConfigEquipo {
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
    rondasJugadasPorEquipo: [0, 0, 0],
    ...overrides,
  };
}

describe("validarContexto — R3 bloques de titulares (art. 51.1/51.4)", () => {
  it("titular del equipo A (nº3) alineado en el equipo B es error 51.1", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p3")];
    const ctx = ctxBase({ equipoIndice: 1 });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    const err = infs.find((i) => i.articulo === "51.1");
    expect(err).toBeDefined();
    expect(err!.nivel).toBe("error");
    expect(err!.mensaje).toContain("Jugador3");
  });

  it("titular del equipo B (nº10) alineado en el equipo A (subir) NO es error", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")];
    const ctx = ctxBase({ equipoIndice: 0 });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.1")).toBe(false);
  });

  it("titular del propio equipo (nº2 en el A) no genera error 51.1", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p2")];
    const ctx = ctxBase({ equipoIndice: 0 });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.1")).toBe(false);
  });
});

describe("validarContexto — R4 límites autonómicos (art. 51.5.c)", () => {
  it("nº20 en el equipo A autonómico es error 51.5.c (>18)", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p20")];
    const ctx = ctxBase({ equipoIndice: 0, esDivisionAutonomica: [true, true, true] });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(true);
  });

  it("nº20 en el equipo A NO autonómico no genera error 51.5.c", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p20")];
    const ctx = ctxBase({ equipoIndice: 0, esDivisionAutonomica: [false, false, false] });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(false);
  });

  it("nº19 en el equipo B (3 equipos, autonómico) NO genera error 51.5.c", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p19")];
    const ctx = ctxBase({ equipoIndice: 1, esDivisionAutonomica: [true, true, true] });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.5.c")).toBe(false);
  });

  it("nº29 en el equipo B (3 equipos, autonómico) es error 51.5.c", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p29")];
    const ctx = ctxBase({ equipoIndice: 1, esDivisionAutonomica: [true, true, true] });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
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
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
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
      rondasJugadasPorEquipo: [0, 4, 0], // p10 es titular de B (bloque 1): 4 rondas de B
    });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
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
      rondasJugadasPorEquipo: [0, 4, 0],
    });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.3")).toBe(false);
  });

  it("error 51.3: jugador ya bloqueado (2 de 4 rondas) alineado de vuelta en su equipo de origen (B)", () => {
    const orden = clubTresEquipos();
    const alineacion = [t(1, "p10")]; // p10 titular de B, alineado en el propio B
    const ctx = ctxBase({
      equipoIndice: 1,
      vecesEnSuperior: { p10: 2 },
      rondasJugadasPorEquipo: [0, 4, 0],
    });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
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
      rondasJugadasPorEquipo: [0, 4, 0],
    });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);
    expect(infs.some((i) => i.articulo === "51.3")).toBe(false);
  });

  // Finding 3 (Fix round 1): rondasJugadasPorEquipo por equipo, no un
  // escalar único. En una misma convocatoria del equipo B hay un titular
  // propio de B (p10) Y un titular de C jugando "arriba" en el B (p20); cada
  // uno debe medirse contra las rondas de SU equipo de origen (B=4, C=10),
  // no contra un valor compartido.
  it("titular de B (rondas de B) y titular de C jugando arriba (rondas de C) en la MISMA alineación usan cada uno su propio umbral", () => {
    const orden = clubTresEquipos();
    // p10: titular de B (bloque 1), alineado en su propio equipo B.
    // p20: titular de C (bloque 2), alineado "arriba" en el B.
    const alineacion = [t(1, "p10"), t(2, "p20")];
    const ctx = ctxBase({
      equipoIndice: 1, // validando el equipo B
      vecesEnSuperior: { p10: 2, p20: 2 },
      rondasJugadasPorEquipo: [0, 4, 10], // A irrelevante; B=4 rondas; C=10 rondas
    });
    const infs = validarContexto(orden, alineacion, cfgPermisiva(null, 8), ctx);

    // p10 (origen B, 4 rondas): 2 de 4 = 50% → ya bloqueado, error al alinearse en B.
    const errP10 = infs.find((i) => i.articulo === "51.3" && i.nivel === "error");
    expect(errP10).toBeDefined();
    expect(errP10!.mensaje).toContain("Jugador10");

    // p20 (origen C, 10 rondas): 2+1=3 de 10 = 30% < 50% → SIN aviso. Si el
    // código usara por error las rondas del equipo que se valida (B=4) en
    // vez de las del equipo de origen del titular (C=10), el umbral sería
    // 2 y 3 >= 2 dispararía un aviso indebido: esta aserción falla si esa
    // regresión reaparece.
    const avisosP20 = infs.filter((i) => i.articulo === "51.3" && i.mensaje.includes("Jugador20"));
    expect(avisosP20).toEqual([]);
  });
});

describe("validarContexto — R7 misma fecha (arts. 54-55)", () => {
  it("jugador presente en la convocatoria de otro equipo la misma fecha es error, en AMBAS direcciones", () => {
    const orden = clubTresEquipos();

    // Perspectiva del equipo A: p5 también convocado por el B.
    const infsA = validarContexto(
      orden,
      [t(1, "p5")],
      cfgPermisiva(null, 8),
      ctxBase({ equipoIndice: 0, alineacionesMismaFecha: [{ equipoIndice: 1, playerIds: ["p5"] }] })
    );
    expect(infsA.some((i) => i.articulo === "54/55")).toBe(true);

    // Perspectiva del equipo B: mismo jugador, misma fecha, dirección inversa.
    const infsB = validarContexto(
      orden,
      [t(1, "p5")],
      cfgPermisiva(null, 8),
      ctxBase({ equipoIndice: 1, alineacionesMismaFecha: [{ equipoIndice: 0, playerIds: ["p5"] }] })
    );
    expect(infsB.some((i) => i.articulo === "54/55")).toBe(true);
  });

  it("sin coincidencia de jugadores en otras convocatorias, no genera error 54/55", () => {
    const orden = clubTresEquipos();
    const infs = validarContexto(
      orden,
      [t(1, "p5")],
      cfgPermisiva(null, 8),
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
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfgPermisiva(null, 2) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfgPermisiva(null, 2), ctx);
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
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfgPermisiva(null, 2) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfgPermisiva(null, 2), ctx);
    expect(infs.some((i) => i.articulo === "52.4")).toBe(false);
  });

  it("sin equipos en mismaSede, no se ejecuta ninguna comprobación 52.4", () => {
    const orden = [j(1), j(2)];
    const infs = validarContexto(orden, [t(1, "p2"), t(2, "p1")], cfgPermisiva(null, 2), ctxBase({ equipoIndice: 0, mismaSede: [] }));
    expect(infs.some((i) => i.articulo === "52.4")).toBe(false);
  });

  // Finding 1 (Fix round 1): la config combinada NO puede ser más permisiva
  // que un participante con margenElo null (51.2 puro, sin excepción). Antes
  // de este fix, margenCombinado tomaba el MÍNIMO de los márgenes NO nulos
  // (aquí 200, el de A), ignorando que B no tiene margen aplicable en
  // absoluto: una diferencia de ELO de solo 10 puntos se colaba como "aviso
  // de inversión legal (<200)" en vez de error 51.2.
  it("[Finding 1] A(margen 200, permisivo) + B(margen null, permisivo): inversión cruzada con diferencia de 10 es ERROR 52.4, no aviso", () => {
    const orden = [j(1, { fuerza: 2010 }), j(2, { fuerza: 2000 })];
    // Equipo A: nº2 (peor orden) en su único tablero.
    const alineacionEquipoA: TableroPropuesto[] = [t(1, "p2")];
    // Equipo B (el que validamos, margen null): nº1 (mejor orden) en su
    // único tablero. Al combinar, nº1 queda DETRÁS de nº2 (inversión), con
    // una diferencia de fuerza de solo 10 puntos.
    const alineacionEquipoB: TableroPropuesto[] = [t(1, "p1")];

    const ctx = ctxBase({
      equipoIndice: 1,
      numTablerosPorEquipo: [1, 1],
      totalEquipos: 2,
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfgPermisiva(200, 1, true) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfgPermisiva(null, 1, true), ctx);
    const relevantes52_4 = infs.filter((i) => i.articulo === "52.4");
    expect(relevantes52_4.some((i) => i.nivel === "error")).toBe(true);
    expect(relevantes52_4.some((i) => i.nivel === "aviso" && i.mensaje.toLowerCase().includes("inversión legal"))).toBe(
      false
    );
  });

  // Finding 2 (Fix round 1): una infracción interna de OTRO equipo de la
  // sede (ninguno de los jugadores implicados es del equipo que se está
  // validando) no puede reenviarse como ERROR bloqueante al equipo inocente:
  // el art. 52.4 dice que "las sanciones solo le afectan al equipo que ha
  // cometido las infracciones". Debe degradarse a aviso informativo.
  it("[Finding 2] equipo A internamente invertido, B limpio: validar B da AVISO (no error) prefijado con el equipo responsable", () => {
    const orden = [j(1), j(10), j(20)];
    // Equipo A invertido consigo mismo: nº10 (peor orden) delante de nº1.
    const alineacionEquipoA: TableroPropuesto[] = [t(1, "p10"), t(2, "p1")];
    // Equipo B (el que validamos): solo nº20, sin conflicto con nadie.
    const alineacionEquipoB: TableroPropuesto[] = [t(1, "p20")];

    const ctx = ctxBase({
      equipoIndice: 1,
      numTablerosPorEquipo: [2, 1],
      totalEquipos: 2,
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfgPermisiva(null, 2) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfgPermisiva(null, 1), ctx);
    const relevantes52_4 = infs.filter((i) => i.articulo === "52.4");
    expect(relevantes52_4.length).toBeGreaterThan(0);
    expect(relevantes52_4.every((i) => i.nivel === "aviso")).toBe(true);
    expect(relevantes52_4.some((i) => i.mensaje.includes("(equipo A de la sede)"))).toBe(true);
  });

  // Minor (a) / finding 4a: sanear las alineaciones de los OTROS equipos de
  // la sede con la misma pasada de entradas válidas que nucleo.ts, para que
  // un tablero fuera de rango de otro equipo no "colisione" en la
  // numeración virtual con un tablero real del equipo que se está validando
  // y lo descarte por "repetido", enmascarando una infracción cruzada real.
  it("[Minor 4a] una entrada fuera de rango en OTRO equipo de la sede no colisiona con un tablero real nuestro en la numeración virtual", () => {
    const orden = [j(1), j(2)]; // p1 mejor orden, p2 peor orden
    // Equipo A (numTableros=2): p2 en su tablero real 1, más una entrada
    // corrupta en el tablero 3 (fuera de rango para A).
    const alineacionEquipoA: TableroPropuesto[] = [t(1, "p2"), t(3, "p2")];
    // Equipo B (el que validamos, numTableros=1): p1 (mejor orden) en su
    // único tablero. Sin sanear la entrada corrupta de A, el tablero 3
    // fuera de rango colisionaría en la numeración virtual con el tablero
    // de B (offset 2 + tablero 1 = 3) y el jugador real de B (p1) se
    // descartaría como "repetido", enmascarando la inversión cruzada real.
    const alineacionEquipoB: TableroPropuesto[] = [t(1, "p1")];

    const ctx = ctxBase({
      equipoIndice: 1,
      numTablerosPorEquipo: [2, 1],
      totalEquipos: 2,
      mismaSede: [{ equipoIndice: 0, alineacion: alineacionEquipoA, config: cfgPermisiva(null, 2) }],
    });

    const infs = validarContexto(orden, alineacionEquipoB, cfgPermisiva(null, 1), ctx);
    const errores52_4 = infs.filter((i) => i.articulo === "52.4" && i.nivel === "error");
    expect(errores52_4.length).toBeGreaterThan(0);
    expect(errores52_4.some((i) => i.mensaje.includes("Jugador1"))).toBe(true);
  });
});
