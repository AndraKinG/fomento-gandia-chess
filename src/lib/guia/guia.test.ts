import { describe, expect, it } from "vitest";
import { GUIA, guiaPara, guiaParaElModelo } from "./guia";

describe("guiaPara", () => {
  it("al jugador no le enseña junta ni admin", () => {
    const claves = guiaPara("jugador").map((s) => s.clave);
    expect(claves).not.toContain("solicitudes");
    expect(claves).not.toContain("admin");
    expect(claves).toContain("jugar");
  });

  it("la junta ve lo suyo pero no admin", () => {
    const claves = guiaPara("junta").map((s) => s.clave);
    expect(claves).toContain("solicitudes");
    expect(claves).not.toContain("admin");
  });

  it("el admin lo ve todo: los cargos se acumulan", () => {
    expect(guiaPara("admin")).toHaveLength(GUIA.length);
  });
});

describe("guiaParaElModelo", () => {
  it("cuenta lo mismo que la pantalla: mismas secciones, mismo filtro", () => {
    // Es LA garantía de esta fuente única: si el modelo menciona una sección,
    // es porque la pantalla también la enseña a ese rango.
    const texto = guiaParaElModelo("jugador");
    expect(texto).toContain("Jugar");
    expect(texto).not.toContain("Administración");
    expect(guiaParaElModelo("admin")).toContain("Administración");
  });
});

describe("el catálogo", () => {
  it("sin claves repetidas y sin secciones vacías", () => {
    const claves = GUIA.map((s) => s.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const s of GUIA) expect(s.puntos.length).toBeGreaterThan(0);
  });
});
