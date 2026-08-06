import { describe, expect, it } from "vitest";
import {
  clasificar,
  estadoParaEmparejar,
  rondaCompleta,
  type RondaJugada,
} from "./clasificacion";

const inscritos = [
  { ficha: "ana", eloInicial: 1900 },
  { ficha: "bea", eloInicial: 1850 },
  { ficha: "cris", eloInicial: 1800 },
  { ficha: "dani", eloInicial: 1750 },
];

describe("clasificar", () => {
  it("cuenta puntos, victorias, tablas y derrotas de los dos lados", () => {
    const rondas: RondaJugada[] = [
      {
        numero: 1,
        descansa: null,
        emparejamientos: [
          { blancas: "ana", negras: "bea", resultado: "1" },
          { blancas: "cris", negras: "dani", resultado: "0.5" },
        ],
      },
    ];
    const tabla = clasificar(rondas, inscritos);
    const ana = tabla.find((f) => f.ficha === "ana")!;
    const bea = tabla.find((f) => f.ficha === "bea")!;
    const cris = tabla.find((f) => f.ficha === "cris")!;

    expect(ana.puntos).toBe(1);
    expect(ana.victorias).toBe(1);
    expect(bea.puntos).toBe(0);
    expect(bea.derrotas).toBe(1);
    expect(cris.puntos).toBe(0.5);
    expect(cris.tablas).toBe(1);
  });

  it("las partidas sin resultado no cuentan para nada", () => {
    const rondas: RondaJugada[] = [
      {
        numero: 1,
        descansa: null,
        emparejamientos: [{ blancas: "ana", negras: "bea", resultado: null }],
      },
    ];
    const tabla = clasificar(rondas, inscritos);
    expect(tabla.every((f) => f.puntos === 0 && f.jugadas === 0)).toBe(true);
  });

  it("un descanso puntúa como tablas y NO cuenta como partida jugada", () => {
    const rondas: RondaJugada[] = [
      { numero: 1, descansa: "dani", emparejamientos: [] },
    ];
    const dani = clasificar(rondas, inscritos).find((f) => f.ficha === "dani")!;
    // Medio punto, no uno: regla del club. Ni se perjudica a quien descansa ni se
    // le regala una victoria que no ha jugado.
    expect(dani.puntos).toBe(0.5);
    expect(dani.descansos).toBe(1);
    expect(dani.jugadas).toBe(0); // no mueve su ELO ni su porcentaje
  });

  it("ordena por puntos", () => {
    const rondas: RondaJugada[] = [
      {
        numero: 1,
        descansa: null,
        emparejamientos: [
          { blancas: "dani", negras: "ana", resultado: "1" },
          { blancas: "cris", negras: "bea", resultado: "1" },
        ],
      },
    ];
    const tabla = clasificar(rondas, inscritos);
    expect(tabla.slice(0, 2).map((f) => f.ficha).sort()).toEqual(["cris", "dani"]);
  });

  it("desempata por Buchholz: premia haber tenido rivales más fuertes", () => {
    // Ana y Bea acaban con 1 punto. Ana gano a Cris (que suma 1) y Bea gano a
    // Dani (que suma 0): el calendario de Ana fue mas duro.
    const rondas: RondaJugada[] = [
      {
        numero: 1,
        descansa: null,
        emparejamientos: [
          { blancas: "ana", negras: "cris", resultado: "1" },
          { blancas: "bea", negras: "dani", resultado: "1" },
        ],
      },
      {
        numero: 2,
        descansa: null,
        emparejamientos: [
          { blancas: "cris", negras: "dani", resultado: "1" },
          { blancas: "ana", negras: "bea", resultado: "0.5" },
        ],
      },
    ];
    const tabla = clasificar(rondas, inscritos);
    const ana = tabla.find((f) => f.ficha === "ana")!;
    const bea = tabla.find((f) => f.ficha === "bea")!;
    expect(ana.puntos).toBe(bea.puntos);
    expect(ana.buchholz).toBeGreaterThan(bea.buchholz);
    expect(tabla.findIndex((f) => f.ficha === "ana")).toBeLessThan(
      tabla.findIndex((f) => f.ficha === "bea")
    );
  });

  it("a igual puntuación y Buchholz, gana quien tiene más victorias", () => {
    // Montado para que Ana y Bea empaten en puntos Y en Buchholz:
    //   Ana: tablas con Cris + tablas con Dani = 1 punto, 0 victorias.
    //   Bea: gana a Dani + pierde con Cris    = 1 punto, 1 victoria.
    // Los dos se han enfrentado a Cris y a Dani, así que el Buchholz coincide y
    // el desempate tiene que decidirlo el número de victorias.
    const rondas: RondaJugada[] = [
      {
        numero: 1,
        descansa: null,
        emparejamientos: [
          { blancas: "ana", negras: "cris", resultado: "0.5" },
          { blancas: "bea", negras: "dani", resultado: "1" },
        ],
      },
      {
        numero: 2,
        descansa: null,
        emparejamientos: [
          { blancas: "ana", negras: "dani", resultado: "0.5" },
          { blancas: "bea", negras: "cris", resultado: "0" },
        ],
      },
    ];
    const tabla = clasificar(rondas, inscritos);
    const conVictoria = tabla.find((f) => f.ficha === "bea")!;
    const conTablas = tabla.find((f) => f.ficha === "ana")!;

    expect(conVictoria.puntos).toBe(1);
    expect(conTablas.puntos).toBe(1);
    expect(conVictoria.buchholz).toBe(conTablas.buchholz);
    expect(conVictoria.victorias).toBe(1);
    expect(conTablas.victorias).toBe(0);
    // Y con todo empatado salvo las victorias, Bea va delante.
    expect(tabla.findIndex((f) => f.ficha === "bea")).toBeLessThan(
      tabla.findIndex((f) => f.ficha === "ana")
    );
  });

  it("todos los inscritos salen en la tabla, aunque no hayan jugado", () => {
    const tabla = clasificar([], inscritos);
    expect(tabla).toHaveLength(4);
    expect(tabla.every((f) => f.puntos === 0)).toBe(true);
    // Sin partidas, el orden lo pone el ELO de partida.
    expect(tabla[0].ficha).toBe("ana");
  });

  it("es determinista", () => {
    const rondas: RondaJugada[] = [
      {
        numero: 1,
        descansa: null,
        emparejamientos: [{ blancas: "ana", negras: "bea", resultado: "1" }],
      },
    ];
    expect(clasificar(rondas, inscritos)).toEqual(clasificar(rondas, inscritos));
  });
});

describe("rondaCompleta", () => {
  it("solo cuando todas las partidas tienen resultado", () => {
    expect(
      rondaCompleta({
        numero: 1,
        descansa: null,
        emparejamientos: [
          { blancas: "a", negras: "b", resultado: "1" },
          { blancas: "c", negras: "d", resultado: null },
        ],
      })
    ).toBe(false);

    expect(
      rondaCompleta({
        numero: 1,
        descansa: null,
        emparejamientos: [{ blancas: "a", negras: "b", resultado: "1" }],
      })
    ).toBe(true);
  });

  it("una ronda de solo descanso está completa", () => {
    expect(rondaCompleta({ numero: 1, descansa: "a", emparejamientos: [] })).toBe(true);
  });
});

describe("estadoParaEmparejar", () => {
  const rondas: RondaJugada[] = [
    {
      numero: 1,
      descansa: null,
      emparejamientos: [
        { blancas: "ana", negras: "bea", resultado: "1" },
        { blancas: "cris", negras: "dani", resultado: "0" },
      ],
    },
    {
      numero: 2,
      descansa: "cris",
      emparejamientos: [{ blancas: "dani", negras: "ana", resultado: "0.5" }],
    },
  ];

  it("junta rivales, colores y descansos de todas las rondas", () => {
    const estado = estadoParaEmparejar(rondas, inscritos);
    const ana = estado.find((e) => e.ficha === "ana")!;
    expect(ana.rivales).toEqual(["bea", "dani"]);
    expect(ana.colores).toEqual(["blancas", "negras"]);
    expect(ana.puntos).toBe(1.5);
    expect(ana.haDescansado).toBe(false);
  });

  it("marca a quien ha descansado y le cuenta el medio punto", () => {
    const cris = estadoParaEmparejar(rondas, inscritos).find((e) => e.ficha === "cris")!;
    expect(cris.haDescansado).toBe(true);
    expect(cris.puntos).toBe(0.5); // 0 de la ronda 1 + 0.5 del descanso
  });

  it("quien no ha jugado nada arranca vacío pero aparece", () => {
    const bea = estadoParaEmparejar(rondas, inscritos).find((e) => e.ficha === "bea")!;
    expect(bea.rivales).toEqual(["ana"]);
    expect(bea.puntos).toBe(0);
  });

  it("devuelve una entrada por inscrito, en el orden de inscripción", () => {
    const estado = estadoParaEmparejar(rondas, inscritos);
    expect(estado.map((e) => e.ficha)).toEqual(["ana", "bea", "cris", "dani"]);
  });
});
