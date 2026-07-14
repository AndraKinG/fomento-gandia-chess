import { describe, expect, it } from "vitest";
import { fechaMadrid, limitesDiaMadrid } from "./fecha-madrid";

describe("fechaMadrid", () => {
  it("mapea un instante UTC de invierno a su fecha local de Madrid (+01:00)", () => {
    // 15 de enero 2026, 23:30 UTC = 16 enero 00:30 en Madrid (invierno).
    expect(fechaMadrid("2026-01-15T23:30:00+00:00")).toBe("2026-01-16");
  });

  it("mapea un instante UTC de verano a su fecha local de Madrid (+02:00)", () => {
    // 15 de julio 2026, 22:30 UTC = 16 julio 00:30 en Madrid (verano).
    expect(fechaMadrid("2026-07-15T22:30:00+00:00")).toBe("2026-07-16");
  });

  it("una hora normal de sábado por la tarde cae en el mismo día", () => {
    // 17:00 hora Madrid en verano = 15:00 UTC.
    expect(fechaMadrid("2026-07-18T15:00:00+00:00")).toBe("2026-07-18");
  });
});

describe("limitesDiaMadrid", () => {
  it("da un rango [desde, hasta) que cubre exactamente ese día en Madrid (invierno)", () => {
    const { desde, hasta } = limitesDiaMadrid("2026-01-16");
    expect(desde).toBe("2026-01-16T00:00:00+01:00");
    expect(hasta).toBe("2026-01-17T00:00:00+01:00");
  });

  it("da un rango [desde, hasta) que cubre exactamente ese día en Madrid (verano)", () => {
    const { desde, hasta } = limitesDiaMadrid("2026-07-18");
    expect(desde).toBe("2026-07-18T00:00:00+02:00");
    expect(hasta).toBe("2026-07-19T00:00:00+02:00");
  });

  it("ida y vuelta: un instante al mediodía de ese día vuelve a la misma fecha", () => {
    const { desde } = limitesDiaMadrid("2026-07-18");
    const medioDia = new Date(desde);
    medioDia.setUTCHours(medioDia.getUTCHours() + 12);
    expect(fechaMadrid(medioDia.toISOString())).toBe("2026-07-18");
  });
});
