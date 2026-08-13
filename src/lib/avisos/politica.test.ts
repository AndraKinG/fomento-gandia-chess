import { describe, expect, it } from "vitest";
import {
  GRUPO_DE,
  NO_SILENCIABLES,
  debePush,
  debeReintentar,
  estadoPushDeAviso,
  tratarFallo,
  type TipoAviso,
} from "./politica";

describe("debePush", () => {
  it("convocatoria hace push aunque el grupo interclubs esté silenciado (no silenciable)", () => {
    expect(
      debePush("convocatoria", { silenciados: ["interclubs"], tieneSuscripcion: true })
    ).toBe(true);
  });

  it("un tipo silenciable no hace push si su grupo está silenciado", () => {
    expect(
      debePush("disponibilidad_peticion", {
        silenciados: ["interclubs"],
        tieneSuscripcion: true,
      })
    ).toBe(false);
  });

  it("silenciar un grupo no afecta a los tipos de otro grupo", () => {
    expect(
      debePush("reto_aceptado", { silenciados: ["torneos"], tieneSuscripcion: true })
    ).toBe(true);
  });

  it("sin suscripción no hay push para ningún tipo, ni siquiera convocatoria", () => {
    // No es un fallo: no hay dónde mandarlo, pero el aviso vive en la bandeja igual.
    expect(
      debePush("convocatoria", { silenciados: [], tieneSuscripcion: false })
    ).toBe(false);
    expect(
      debePush("disponibilidad_peticion", { silenciados: [], tieneSuscripcion: false })
    ).toBe(false);
  });

  it("con silenciados vacío, todo hace push (si hay suscripción)", () => {
    expect(
      debePush("torneo_interes", { silenciados: [], tieneSuscripcion: true })
    ).toBe(true);
  });

  it("un valor basura en silenciados no rompe ni silencia nada", () => {
    expect(
      debePush("torneo_interes", {
        silenciados: ["inventado"],
        tieneSuscripcion: true,
      })
    ).toBe(true);
  });

  it("GRUPO_DE cubre los 14 tipos y ninguno queda sin grupo", () => {
    const tipos: TipoAviso[] = [
      "convocatoria",
      "disponibilidad_peticion",
      "disponibilidad_recordatorio",
      "torneo_interes",
      "torneo_primer_apuntado",
      "ronda_hora",
      "mote_pedido",
      "mote_resuelto",
      "coche_plaza_libre",
      "coche_sin_plaza",
      "reto_aceptado",
      "alta_socio",
      "vinculacion",
      "fichas_nuevas",
    ];
    expect(tipos.length).toBe(14);
    for (const tipo of tipos) {
      expect(GRUPO_DE[tipo]).toBeDefined();
    }
    // El objeto no puede traer claves de más ni de menos.
    expect(Object.keys(GRUPO_DE).sort()).toEqual([...tipos].sort());
  });

  it("NO_SILENCIABLES es exactamente convocatoria", () => {
    expect(NO_SILENCIABLES).toEqual(["convocatoria"]);
  });
});

describe("tratarFallo", () => {
  it("410 (gone) es no_tocaba y borra la suscripción", () => {
    expect(tratarFallo(410)).toEqual({ estado: "no_tocaba", borrarSuscripcion: true });
  });

  it("404 (not found) es no_tocaba y borra la suscripción", () => {
    expect(tratarFallo(404)).toEqual({ estado: "no_tocaba", borrarSuscripcion: true });
  });

  it("500 es fallido y no borra: es reintentable", () => {
    expect(tratarFallo(500)).toEqual({ estado: "fallido", borrarSuscripcion: false });
  });

  it("sin status (undefined, p. ej. la red falló) es fallido y no borra", () => {
    expect(tratarFallo(undefined)).toEqual({ estado: "fallido", borrarSuscripcion: false });
  });
});

describe("debeReintentar", () => {
  it("fallido en el primer intento se reintenta", () => {
    expect(debeReintentar({ push: "fallido", push_intentos: 0 })).toBe(true);
  });

  it("fallido tras ya haber reintentado una vez no se vuelve a intentar", () => {
    expect(debeReintentar({ push: "fallido", push_intentos: 1 })).toBe(false);
  });

  it("entregado no se reintenta", () => {
    expect(debeReintentar({ push: "entregado", push_intentos: 0 })).toBe(false);
  });

  it("no_tocaba no se reintenta", () => {
    expect(debeReintentar({ push: "no_tocaba", push_intentos: 0 })).toBe(false);
  });
});

describe("estadoPushDeAviso", () => {
  it("al menos un dispositivo entregado es entregado, aunque otro haya fallado", () => {
    expect(
      estadoPushDeAviso([{ entregado: true }, { entregado: false, estado: "fallido" }])
    ).toBe("entregado");
  });

  it("ninguno entregado pero alguno fallido de verdad es fallido (se reintenta)", () => {
    expect(
      estadoPushDeAviso([
        { entregado: false, estado: "no_tocaba" },
        { entregado: false, estado: "fallido" },
      ])
    ).toBe("fallido");
  });

  it("todos no_tocaba (suscripciones muertas) es no_tocaba", () => {
    expect(
      estadoPushDeAviso([
        { entregado: false, estado: "no_tocaba" },
        { entregado: false, estado: "no_tocaba" },
      ])
    ).toBe("no_tocaba");
  });

  it("lista vacía (sin ningún dispositivo al mandar) es no_tocaba, no fallido", () => {
    expect(estadoPushDeAviso([])).toBe("no_tocaba");
  });
});
