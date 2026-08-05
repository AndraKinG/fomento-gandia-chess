import { describe, expect, it } from "vitest";
import {
  cocheDePasajero,
  efectosDeApuntarse,
  efectosDeBajarse,
  efectosDeBorrarCoche,
  efectosDeCambiarAsistencia,
  esConductor,
  ocupadas,
  plazasLibres,
  puedeApuntarse,
  puedeCambiarPlazas,
  resumenTransporte,
  type Estado,
} from "./coches";

// Escenario base: dos coches. El de Ana con 3 plazas y 1 ocupada (Carlos);
// el de Berta con 1 plaza, libre.
const base = (): Estado => ({
  coches: [
    { id: "coche-ana", conductorId: "ana", plazas: 3 },
    { id: "coche-berta", conductorId: "berta", plazas: 1 },
  ],
  asientos: [{ cocheId: "coche-ana", playerId: "carlos" }],
  asistencias: { ana: "voy", berta: "voy", carlos: "voy", diana: "duda" },
});

describe("consultas básicas", () => {
  it("cuenta ocupadas y libres", () => {
    const e = base();
    expect(ocupadas("coche-ana", e.asientos)).toBe(1);
    expect(plazasLibres(e.coches[0], e.asientos)).toBe(2);
    expect(plazasLibres(e.coches[1], e.asientos)).toBe(1);
  });

  it("plazasLibres nunca es negativo aunque los datos vengan incoherentes", () => {
    const coche = { id: "c", conductorId: "ana", plazas: 1 };
    const asientos = [
      { cocheId: "c", playerId: "x" },
      { cocheId: "c", playerId: "y" },
      { cocheId: "c", playerId: "z" },
    ];
    expect(plazasLibres(coche, asientos)).toBe(0);
  });

  it("localiza el coche de un pasajero y a los conductores", () => {
    const e = base();
    expect(cocheDePasajero("carlos", e)?.id).toBe("coche-ana");
    expect(cocheDePasajero("diana", e)).toBeNull();
    expect(esConductor("ana", e)).toBe(true);
    expect(esConductor("carlos", e)).toBe(false);
  });
});

describe("puedeApuntarse", () => {
  it("deja apuntarse a quien no va en ningún coche y hay sitio", () => {
    expect(puedeApuntarse("diana", "coche-ana", base())).toEqual({ puede: true });
  });

  it("rechaza si el coche está lleno", () => {
    const e = base();
    e.asientos.push({ cocheId: "coche-berta", playerId: "diana" });
    expect(puedeApuntarse("elena", "coche-berta", e)).toEqual({
      puede: false,
      motivo: "coche_lleno",
    });
  });

  it("rechaza si ya va en otro coche (regla: nadie en dos coches)", () => {
    expect(puedeApuntarse("carlos", "coche-berta", base())).toEqual({
      puede: false,
      motivo: "ya_va_en_otro_coche",
    });
  });

  it("rechaza que el conductor sea pasajero de su propio coche", () => {
    expect(puedeApuntarse("ana", "coche-ana", base())).toEqual({
      puede: false,
      motivo: "es_el_conductor_de_este",
    });
  });

  it("rechaza que un conductor sea pasajero de otro coche", () => {
    expect(puedeApuntarse("berta", "coche-ana", base())).toEqual({
      puede: false,
      motivo: "es_conductor_de_otro",
    });
  });

  it("rechaza un coche que no existe", () => {
    expect(puedeApuntarse("diana", "fantasma", base())).toEqual({
      puede: false,
      motivo: "coche_inexistente",
    });
  });

  it("el conductor no ocupa plaza de pasajero: su coche de 3 admite 3", () => {
    const e: Estado = {
      coches: [{ id: "c", conductorId: "ana", plazas: 3 }],
      asientos: [],
      asistencias: {},
    };
    for (const p of ["p1", "p2", "p3"]) {
      expect(puedeApuntarse(p, "c", e)).toEqual({ puede: true });
      e.asientos.push({ cocheId: "c", playerId: p });
    }
    expect(puedeApuntarse("p4", "c", e)).toEqual({ puede: false, motivo: "coche_lleno" });
  });
});

describe("efectosDeApuntarse", () => {
  it("apuntarse implica ir al torneo si no había respondido", () => {
    const e = base();
    delete e.asistencias.diana;
    const { cambios } = efectosDeApuntarse("diana", "coche-ana", e);
    expect(cambios).toEqual([
      { tipo: "ocupar_plaza", cocheId: "coche-ana", playerId: "diana" },
      { tipo: "asistencia", playerId: "diana", estado: "voy" },
    ]);
  });

  it("un 'duda' pasa a 'voy' al coger sitio", () => {
    const { cambios } = efectosDeApuntarse("diana", "coche-ana", base());
    expect(cambios).toContainEqual({ tipo: "asistencia", playerId: "diana", estado: "voy" });
  });

  it("quien había dicho 'no_voy' pasa a 'voy'", () => {
    const e = base();
    e.asistencias.diana = "no_voy";
    const { cambios } = efectosDeApuntarse("diana", "coche-ana", e);
    expect(cambios).toContainEqual({ tipo: "asistencia", playerId: "diana", estado: "voy" });
  });

  it("si ya decía 'voy' no toca su asistencia (solo ocupa la plaza)", () => {
    const e = base();
    e.asistencias.diana = "voy";
    const { cambios } = efectosDeApuntarse("diana", "coche-ana", e);
    expect(cambios).toEqual([
      { tipo: "ocupar_plaza", cocheId: "coche-ana", playerId: "diana" },
    ]);
  });

  it("no produce ningún efecto si no puede apuntarse", () => {
    expect(efectosDeApuntarse("carlos", "coche-berta", base())).toEqual({
      cambios: [],
      avisos: [],
    });
  });
});

describe("efectosDeCambiarAsistencia", () => {
  it("decir 'no_voy' libera la plaza y avisa al conductor", () => {
    const { cambios, avisos } = efectosDeCambiarAsistencia("carlos", "no_voy", base());
    expect(cambios).toEqual([
      { tipo: "asistencia", playerId: "carlos", estado: "no_voy" },
      { tipo: "liberar_plaza", cocheId: "coche-ana", playerId: "carlos" },
    ]);
    expect(avisos).toEqual([
      { tipo: "plaza_liberada", destinatarioId: "ana", pasajeroId: "carlos" },
    ]);
  });

  it("pasar a 'duda' NO libera la plaza: la reserva sigue en pie", () => {
    const { cambios, avisos } = efectosDeCambiarAsistencia("carlos", "duda", base());
    expect(cambios).toEqual([{ tipo: "asistencia", playerId: "carlos", estado: "duda" }]);
    expect(avisos).toEqual([]);
  });

  it("decir 'no_voy' sin plaza asignada no genera avisos", () => {
    const { cambios, avisos } = efectosDeCambiarAsistencia("diana", "no_voy", base());
    expect(cambios).toEqual([{ tipo: "asistencia", playerId: "diana", estado: "no_voy" }]);
    expect(avisos).toEqual([]);
  });
});

describe("efectosDeBajarse", () => {
  it("libera la plaza y avisa al conductor, sin tocar la asistencia", () => {
    const { cambios, avisos } = efectosDeBajarse("carlos", base());
    expect(cambios).toEqual([
      { tipo: "liberar_plaza", cocheId: "coche-ana", playerId: "carlos" },
    ]);
    expect(cambios.some((c) => c.tipo === "asistencia")).toBe(false);
    expect(avisos).toHaveLength(1);
  });

  it("quien no va en ningún coche no genera efectos", () => {
    expect(efectosDeBajarse("diana", base())).toEqual({ cambios: [], avisos: [] });
  });
});

describe("efectosDeBorrarCoche", () => {
  it("deja a los pasajeros sin plaza pero con su asistencia intacta", () => {
    const e = base();
    e.asientos.push({ cocheId: "coche-ana", playerId: "diana" });
    const { cambios, avisos } = efectosDeBorrarCoche("coche-ana", e);

    // Ningún cambio toca la asistencia: querer ir sigue siendo verdad.
    expect(cambios.some((c) => c.tipo === "asistencia")).toBe(false);
    expect(cambios).toContainEqual({ tipo: "borrar_coche", cocheId: "coche-ana" });
    expect(avisos).toEqual([
      { tipo: "te_quedas_sin_coche", destinatarioId: "carlos", cocheId: "coche-ana" },
      { tipo: "te_quedas_sin_coche", destinatarioId: "diana", cocheId: "coche-ana" },
    ]);
  });

  it("borrar el coche va después de liberar las plazas", () => {
    const { cambios } = efectosDeBorrarCoche("coche-ana", base());
    expect(cambios[cambios.length - 1]).toEqual({
      tipo: "borrar_coche",
      cocheId: "coche-ana",
    });
  });

  it("un coche vacío se borra sin avisar a nadie", () => {
    const { cambios, avisos } = efectosDeBorrarCoche("coche-berta", base());
    expect(cambios).toEqual([{ tipo: "borrar_coche", cocheId: "coche-berta" }]);
    expect(avisos).toEqual([]);
  });

  it("un coche que no existe no genera efectos", () => {
    expect(efectosDeBorrarCoche("fantasma", base())).toEqual({ cambios: [], avisos: [] });
  });
});

describe("puedeCambiarPlazas", () => {
  it("deja subir plazas", () => {
    expect(puedeCambiarPlazas("coche-ana", 5, base())).toEqual({ puede: true });
  });

  it("deja bajar hasta las ocupadas exactamente", () => {
    expect(puedeCambiarPlazas("coche-ana", 1, base())).toEqual({ puede: true });
  });

  it("rechaza bajar por debajo de las ocupadas, diciendo cuántas hay", () => {
    const e = base();
    e.asientos.push({ cocheId: "coche-ana", playerId: "diana" }); // 2 ocupadas
    expect(puedeCambiarPlazas("coche-ana", 1, e)).toEqual({
      puede: false,
      motivo: "hay_mas_ocupadas",
      ocupadas: 2,
    });
  });

  it("distingue 'mínimo una plaza' de 'hay más ocupadas'", () => {
    const e = base();
    e.asientos = [];
    // Con 0 ocupadas, un 0 no es "hay más ocupadas": es que el mínimo es 1.
    expect(puedeCambiarPlazas("coche-ana", 0, e)).toEqual({
      puede: false,
      motivo: "minimo_una_plaza",
      ocupadas: 0,
    });
  });

  it("rechaza plazas no enteras o negativas", () => {
    expect(puedeCambiarPlazas("coche-ana", 2.5, base()).puede).toBe(false);
    expect(puedeCambiarPlazas("coche-ana", -1, base()).puede).toBe(false);
  });
});

describe("resumenTransporte", () => {
  it("cuenta quién se queda sin plaza y si faltan sitios", () => {
    // ana y berta conducen; carlos tiene plaza; diana duda y no tiene.
    const r = resumenTransporte(base());
    expect(r.sinPlaza).toEqual(["diana"]);
    expect(r.plazasLibres).toBe(3); // 2 en el de Ana + 1 en el de Berta
    expect(r.faltanPlazas).toBe(false);
  });

  it("detecta que faltan plazas cuando hay más gente que sitios", () => {
    const e: Estado = {
      coches: [{ id: "c", conductorId: "ana", plazas: 1 }],
      asientos: [],
      asistencias: { ana: "voy", b: "voy", c: "voy", d: "voy" },
    };
    const r = resumenTransporte(e);
    expect(r.sinPlaza).toEqual(["b", "c", "d"]);
    expect(r.plazasLibres).toBe(1);
    expect(r.faltanPlazas).toBe(true);
  });

  it("los que dicen 'no_voy' y los que no responden no cuentan", () => {
    const e: Estado = {
      coches: [],
      asientos: [],
      asistencias: { a: "no_voy", b: undefined, c: "voy" },
    };
    expect(resumenTransporte(e).sinPlaza).toEqual(["c"]);
  });

  it("sin nadie apuntado no falta nada", () => {
    const r = resumenTransporte({ coches: [], asientos: [], asistencias: {} });
    expect(r).toEqual({ sinPlaza: [], plazasLibres: 0, faltanPlazas: false });
  });
});
