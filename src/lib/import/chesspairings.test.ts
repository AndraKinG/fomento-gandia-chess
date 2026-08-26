import { describe, expect, it } from "vitest";
import {
  esBye,
  fideIdsDeInscritos,
  idDesdeEnlace,
  mapearClasificacion,
  mapearEmparejamientos,
  mapearTorneo,
  nombreDe,
  resultadoDesdeBlancas,
} from "./chesspairings";

/**
 * JSON REAL de la API de ChessPairings, del torneo 5759 que el propietario creó para
 * esto (2026-08-26). No son ejemplos inventados: es un formato ajeno, y la gracia de
 * estos tests es enterarse el día que cambien un nombre de campo — si no, la
 * clasificación saldría en blanco sin que nada fallara.
 */

const TORNEO = {
  id: 5759,
  tipo: "individuale",
  nome: "Test",
  luogo: "Valencia, España",
  arbitro: "Test",
  data_inizio: "2026-08-26",
  data_fine: "2026-08-27",
  stato: "in_corso",
  tipo_torneo: "swiss",
  sistema_swiss: "dutch",
  motore_abbinamenti: "bbp6",
  num_turni: 4,
  turno_corrente: 2,
  cadenza: "5'",
  rating_tipo: "fide",
  visibilita: "pubblico",
  num_iscritti: 5,
  link_pubblico:
    "https://my.chesspairings.org/pubblico/torneo.php?id=5759&token=ad070c8f61851131f8346195a5ccf2f98aac440f3457015770fb24873a270212",
};

const CLASIFICACION = {
  tipo: "individuale",
  torneo_id: 5759,
  turno_di_riferimento: 2,
  items: [
    {
      posizione: 1,
      iscrizione_id: 78169,
      cognome: "Chen",
      nome: "Eachen",
      titolo: "WCM",
      federazione: "NZL",
      anno_nascita: 1991,
      rating_iniziale: 1962,
      punti: 2,
      spareggi: { buc1: 1, buct: 2, sb: 2, sd: 0, vit: 2 },
      stato: "presente",
    },
    {
      posizione: 5,
      iscrizione_id: 78166,
      cognome: "Esipenko",
      nome: "Andrey",
      titolo: "GM",
      federazione: "RUS",
      rating_iniziale: 2645,
      punti: 0.5,
      spareggi: { buc1: 1.5, buct: 2.5, sb: 0.75, sd: 0, vit: 0 },
      stato: "presente",
    },
  ],
};

const EMPAREJAMIENTOS_R2 = {
  tipo: "individuale",
  torneo_id: 5759,
  turno: 2,
  items: [
    {
      tavolo: 1,
      bianco: { iscrizione_id: 78169, cognome: "Chen", nome: "Eachen", titolo: "WCM", rating: 1962 },
      nero: { iscrizione_id: 78167, cognome: "Eade", nome: "Jim", titolo: "FM", rating: 2320 },
      risultato: "1-0",
      tipo: "partita",
    },
    {
      tavolo: 2,
      bianco: { iscrizione_id: 78168, cognome: "Easwaralingam", nome: "Adesh", rating: 2128 },
      nero: { iscrizione_id: 78166, cognome: "Esipenko", nome: "Andrey", rating: 2645 },
      risultato: "1/2-1/2",
      tipo: "partita",
    },
    {
      tavolo: 3,
      bianco: { iscrizione_id: 78170, cognome: "Tyomkin", nome: "Dimitri", rating: 2447 },
      nero: null,
      risultato: "+--",
      tipo: "bye",
    },
  ],
};

const INSCRITOS = {
  items: [
    { iscrizione_id: 78166, cognome: "Esipenko", nome: "Andrey", rating: 2645, fide_id: 24175439 },
    { iscrizione_id: 78170, cognome: "Tyomkin", nome: "Dimitri", rating: 2447, fide_id: 2803089 },
    { iscrizione_id: 78169, cognome: "Chen", nome: "Eachen", rating: 1962, fide_id: null },
  ],
};

describe("resultadoDesdeBlancas", () => {
  it("traduce su notación a la de la app", () => {
    // Leída de un torneo real, no adivinada.
    expect(resultadoDesdeBlancas("1-0")).toBe("1");
    expect(resultadoDesdeBlancas("0-1")).toBe("0");
    expect(resultadoDesdeBlancas("1/2-1/2")).toBe("0.5");
  });

  it("sin jugar es null, y NO son tablas", () => {
    // Es la confusión que dejaría la clasificación inventada: una ronda en marcha tiene
    // los resultados a null, y pintarlos como ½ daría puntos que nadie ha hecho.
    expect(resultadoDesdeBlancas(null)).toBeNull();
    expect(resultadoDesdeBlancas("")).toBeNull();
  });

  it("el bye no es una partida con resultado", () => {
    expect(resultadoDesdeBlancas("+--")).toBeNull();
  });
});

describe("mapearTorneo", () => {
  const t = mapearTorneo(TORNEO)!;

  it("lee los datos que la pantalla necesita", () => {
    expect(t.id).toBe(5759);
    expect(t.nombre).toBe("Test");
    expect(t.lugar).toBe("Valencia, España");
    expect(t.rondasTotales).toBe(4);
    expect(t.rondaActual).toBe(2);
    expect(t.sistema).toBe("swiss");
    expect(t.motor).toBe("bbp6");
  });

  it("trae el enlace público, así que no hay que pedírselo a nadie", () => {
    expect(t.enlacePublico).toContain("/pubblico/torneo.php?id=5759");
  });

  it("un JSON sin id no es un torneo", () => {
    expect(mapearTorneo({ nome: "Sin id" })).toBeNull();
  });
});

describe("mapearClasificacion", () => {
  const filas = mapearClasificacion(CLASIFICACION);

  it("lee posición, puntos y desempates", () => {
    expect(filas[0].posicion).toBe(1);
    expect(filas[0].apellidos).toBe("Chen");
    expect(filas[0].puntos).toBe(2);
    expect(filas[0].desempates.buc1).toBe(1);
    expect(filas[0].desempates.buct).toBe(2);
    expect(filas[0].desempates.sb).toBe(2);
  });

  it("los medios puntos son medios puntos", () => {
    // Si esto se leyera como entero, media clasificación cambiaría de orden.
    expect(filas[1].puntos).toBe(0.5);
  });

  it("respeta la posición que ellos calculan y no la reordena", () => {
    // Los desempates los calcula su motor con 28 sistemas; recalcularlos aquí sería
    // pedir dos opiniones sobre lo mismo.
    expect(filas.map((f) => f.posicion)).toEqual([1, 5]);
  });
});

describe("mapearEmparejamientos", () => {
  const mesas = mapearEmparejamientos(EMPAREJAMIENTOS_R2);

  it("lee las tres mesas con su resultado", () => {
    expect(mesas).toHaveLength(3);
    expect(mesas[0].resultado).toBe("1");
    expect(mesas[1].resultado).toBe("0.5");
  });

  it("el bye se marca como tal y sin negras", () => {
    expect(mesas[2].esBye).toBe(true);
    expect(mesas[2].negras).toBeNull();
    expect(mesas[2].blancas?.apellidos).toBe("Tyomkin");
  });

  it("una partida normal no es un bye", () => {
    expect(mesas[0].esBye).toBe(false);
  });
});

describe("esBye", () => {
  it("lo dice el tipo, y también la ausencia de rival", () => {
    expect(esBye("bye", null)).toBe(true);
    expect(esBye("partita", null)).toBe(true);
    expect(esBye("partita", { cognome: "X" })).toBe(false);
  });
});

describe("fideIdsDeInscritos", () => {
  it("saca el FIDE ID de cada inscripción", () => {
    // Es lo que permite cruzar con NUESTRAS fichas por id en vez de por nombre: 35 de
    // los 46 socios tienen FIDE ID, así que el cruce es exacto.
    const m = fideIdsDeInscritos(INSCRITOS);
    expect(m.get(78166)).toBe(24175439);
    expect(m.get(78170)).toBe(2803089);
  });

  it("quien no tiene FIDE ID no entra en el mapa", () => {
    // Un null ahí cruzaría a cualquiera con cualquiera.
    expect(fideIdsDeInscritos(INSCRITOS).has(78169)).toBe(false);
  });
});

describe("nombreDe", () => {
  it("junta nombre y apellidos en ese orden", () => {
    expect(nombreDe({ nome: "Andrey", cognome: "Esipenko" })).toBe("Andrey Esipenko");
  });

  it("aguanta que falte uno de los dos", () => {
    expect(nombreDe({ cognome: "Solo" })).toBe("Solo");
    expect(nombreDe(null)).toBe("");
  });
});

describe("idDesdeEnlace", () => {
  it("saca el id del enlace público que se pega a mano", () => {
    expect(idDesdeEnlace(TORNEO.link_pubblico)).toBe(5759);
  });

  it("un enlace que no es de un torneo no da id", () => {
    expect(idDesdeEnlace("https://my.chesspairings.org/")).toBeNull();
    expect(idDesdeEnlace(null)).toBeNull();
  });
});
