import { describe, expect, it } from "vitest";
import {
  agruparUso,
  claveMes,
  claveSemana,
  conUnDecimal,
  mediaConectados,
  porcentajeDelClub,
  tiempoDeUso,
  tiempoPorSocio,
  type UsoDia,
} from "./agrupar";

function dia(fecha: string, extra: Partial<UsoDia> = {}): UsoDia {
  return {
    dia: fecha,
    visitas: 0,
    latidos: 0,
    nuevos: 0,
    partidasVivo: 0,
    retos: 0,
    partidasSubidas: 0,
    mensajesChat: 0,
    avisos: 0,
    pushEntregados: 0,
    ...extra,
  };
}

describe("claveSemana", () => {
  it("devuelve el lunes de la semana", () => {
    // El 2026-08-10 es lunes; el 2026-08-16 es su domingo.
    expect(claveSemana("2026-08-10")).toBe("2026-08-10");
    expect(claveSemana("2026-08-16")).toBe("2026-08-10");
    expect(claveSemana("2026-08-12")).toBe("2026-08-10");
  });

  it("cruza el cambio de mes sin perderse", () => {
    // El 2026-08-01 es sábado: su lunes es el 27 de julio.
    expect(claveSemana("2026-08-01")).toBe("2026-07-27");
  });
});

describe("claveMes", () => {
  it("devuelve el primero del mes", () => {
    expect(claveMes("2026-08-10")).toBe("2026-08-01");
  });
});

describe("agruparUso", () => {
  const dias = [
    dia("2026-08-10", { visitas: 3, latidos: 10, partidasVivo: 2 }),
    dia("2026-08-11", { visitas: 2, latidos: 5, mensajesChat: 7 }),
    dia("2026-08-17", { visitas: 1, latidos: 1 }), // lunes siguiente
  ];
  const actividad = [
    { dia: "2026-08-10", profileId: "ana" },
    { dia: "2026-08-11", profileId: "ana" }, // la misma persona, otro día
    { dia: "2026-08-11", profileId: "bea" },
    { dia: "2026-08-17", profileId: "ana" },
  ];

  it("por día no agrupa nada y sale lo más nuevo primero", () => {
    const g = agruparUso(dias, actividad, "dia");
    expect(g.map((x) => x.clave)).toEqual(["2026-08-17", "2026-08-11", "2026-08-10"]);
    expect(g[2]).toMatchObject({ visitas: 3, latidos: 10, partidasVivo: 2, activos: 1 });
  });

  it("por semana suma los contadores", () => {
    const g = agruparUso(dias, actividad, "semana");
    expect(g).toHaveLength(2);
    expect(g[1]).toMatchObject({
      clave: "2026-08-10",
      visitas: 5,
      latidos: 15,
      partidasVivo: 2,
      mensajesChat: 7,
    });
  });

  it("los activos de la semana NO son la suma de los días", () => {
    // Ana entró lunes y martes: es UNA activa esa semana, no dos. Sumar los
    // conteos diarios es el error clásico de los paneles de uso.
    const g = agruparUso(dias, actividad, "semana");
    expect(g[1].activos).toBe(2); // ana y bea
    expect(g[0].activos).toBe(1); // solo ana
  });

  it("por mes junta las dos semanas", () => {
    const g = agruparUso(dias, actividad, "mes");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ clave: "2026-08-01", visitas: 6, activos: 2 });
  });

  it("actividad de un día sin fila de contadores no inventa periodos", () => {
    const g = agruparUso(dias, [{ dia: "2026-01-01", profileId: "x" }], "dia");
    expect(g.some((x) => x.clave === "2026-01-01")).toBe(false);
  });
});

describe("tiempoDeUso", () => {
  it("en minutos hasta la hora, y en horas a partir de ahí", () => {
    expect(tiempoDeUso(0)).toBe("0 min");
    expect(tiempoDeUso(11)).toBe("55 min");
    expect(tiempoDeUso(12)).toBe("1 h");
    expect(tiempoDeUso(41)).toBe("3 h 25 min");
  });
});

describe("mediaConectados", () => {
  it("latidos entre las franjas del periodo, con coma decimal", () => {
    // 288 franjas por día: 288 latidos en un día = 1,0 de media.
    expect(mediaConectados(288, 1)).toBe("1,0");
    expect(mediaConectados(144, 1)).toBe("0,5");
    expect(mediaConectados(288 * 7, 7)).toBe("1,0");
  });

  it("cero días no divide por cero", () => {
    expect(mediaConectados(100, 0)).toBe("0");
  });
});

describe("nuevos", () => {
  it("se suman por periodo, porque cada socio es nuevo una sola vez", () => {
    // Lo calcula SQL con el primer día de cada socio, así que sumar dos días de
    // la misma semana no puede duplicar a nadie.
    const g = agruparUso(
      [dia("2026-08-10", { nuevos: 2 }), dia("2026-08-11", { nuevos: 1 })],
      [],
      "semana"
    );
    expect(g[0].nuevos).toBe(3);
  });
});

describe("tiempoPorSocio", () => {
  it("reparte el tiempo entre los activos", () => {
    // 24 latidos = 2 h; entre 4 socios, media hora cada uno.
    expect(tiempoPorSocio(24, 4)).toBe("30 min");
  });

  it("sin activos no divide por cero", () => {
    expect(tiempoPorSocio(10, 0)).toBe("—");
  });
});

describe("porcentajeDelClub", () => {
  it("mide sobre las cuentas vinculadas, no sobre las fichas", () => {
    expect(porcentajeDelClub(3, 12)).toBe("25 %");
  });

  it("sin cuentas no dice un porcentaje falso", () => {
    expect(porcentajeDelClub(0, 0)).toBe("—");
  });
});

describe("activosPorDia", () => {
  // Lunes y martes de la misma semana: ana los dos días, bea solo el martes.
  const dias = [dia("2026-08-10"), dia("2026-08-11")];
  const actividad = [
    { dia: "2026-08-10", profileId: "ana" },
    { dia: "2026-08-11", profileId: "ana" },
    { dia: "2026-08-11", profileId: "bea" },
  ];

  it("es la media diaria, no los distintos del periodo", () => {
    // Distintos de la semana: 2 (ana y bea). Media diaria: (1 + 2) / 2 = 1,5.
    // Son dos preguntas distintas y las dos importan: la primera mide alcance,
    // la segunda el pulso de cada día.
    const g = agruparUso(dias, actividad, "semana");
    expect(g[0].activos).toBe(2);
    expect(g[0].activosPorDia).toBe(1.5);
  });

  it("los días sin nadie cuentan y bajan la media", () => {
    // Se añade un miércoles vacío: (1 + 2 + 0) / 3 = 1. Saltárselo daría 1,5 y
    // solo hablaría de los días buenos.
    const g = agruparUso([...dias, dia("2026-08-12")], actividad, "semana");
    expect(g[0].activosPorDia).toBe(1);
  });

  it("en el periodo día vale lo mismo que los activos", () => {
    const g = agruparUso(dias, actividad, "dia");
    for (const grupo of g) expect(grupo.activosPorDia).toBe(grupo.activos);
  });
});

describe("conUnDecimal", () => {
  it("una décima y coma, como se escribe en español", () => {
    expect(conUnDecimal(1.5)).toBe("1,5");
    expect(conUnDecimal(2)).toBe("2,0");
  });
});
