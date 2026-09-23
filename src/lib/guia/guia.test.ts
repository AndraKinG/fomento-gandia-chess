import { readdirSync } from "node:fs";
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

/**
 * QUE LA GUÍA NO SE QUEDE ATRÁS CUANDO SE AÑADE UNA PANTALLA.
 *
 * Pasó de verdad: "Socios del club" se creó el 2026-08-26 y la guía no se enteró, así
 * que ni la pantalla del perfil ni el asistente —que lee de aquí— sabían que existía.
 * Nadie se da cuenta, porque no falla nada: simplemente hay una sección de la app que
 * la app no sabe explicar.
 *
 * SE MIRAN LAS CARPETAS DE RUTAS DE VERDAD, no una lista escrita a mano, que tendría el
 * mismo problema que quiere evitar. Cada carpeta nueva obliga a decir aquí a qué sección
 * de la guía pertenece, o a declararla como pantalla interna.
 */
describe("la guía cubre la app", () => {
  /** Carpeta de ruta → clave de la guía, o null si no es una sección con entrada propia. */
  const DONDE_SALE: Record<string, string | null> = {
    admin: "admin",
    avisos: "avisos",
    disponibilidad: "interclubs",
    equipos: "interclubs",
    jornadas: "interclubs",
    jugar: "jugar",
    "orden-fuerza": "interclubs",
    partidas: "partidas",
    socios: "socios",
    solicitudes: "solicitudes",
    vinculaciones: "vinculaciones",
    torneos: "torneos",
  };

  it("cada carpeta de la zona de socios está contada en alguna sección", () => {
    const carpetas = readdirSync("src/app/club/(vinculado)", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const claves = new Set(GUIA.map((s) => s.clave));

    for (const carpeta of carpetas) {
      expect(
        Object.hasOwn(DONDE_SALE, carpeta),
        `La carpeta "${carpeta}" no está en DONDE_SALE: di en qué sección de la guía sale, o ponla a null si es una pantalla interna.`
      ).toBe(true);
      const clave = DONDE_SALE[carpeta];
      if (clave !== null) {
        expect(claves.has(clave), `La guía no tiene la sección "${clave}"`).toBe(true);
      }
    }
  });
});
