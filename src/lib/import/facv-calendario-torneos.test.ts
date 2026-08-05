import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claveFACV,
  esJornadaInterclubs,
  parseCalendarioTorneosFACV,
} from "./facv-calendario-torneos";

const html = readFileSync(
  join(__dirname, "fixtures", "facv-calendario-torneos.html"),
  "utf-8"
);

// Fixture recortada de calendario_oficial.php (descargada el 2026-08-05): los
// tres primeros meses de 2026 más una rejilla mensual `table-bordered`.
//
// Números reales comprobados sobre ella:
//   34 filas de torneo en las 3 tablas de datos
// − 11 jornadas de Interclubs (que ya viven en `matches`)
// = 23 torneos importables, de los cuales 11 los organiza la FACV y se
//   conservan (Zonal Jocs, Provinciales, Circuito Base...) y 5 duran más de
//   un día.
const FILAS_TOTALES = 34;
const IMPORTABLES = 23;
const DE_LA_FACV = 11;
const MULTIDIA = 5;

describe("parseCalendarioTorneosFACV", () => {
  const torneos = parseCalendarioTorneosFACV(html);

  it("extrae los 23 torneos y excluye las 11 jornadas de Interclubs", () => {
    expect(torneos).toHaveLength(IMPORTABLES);
    expect(FILAS_TOTALES - torneos.length).toBe(11);
    expect(torneos.some((t) => /interclubs/i.test(t.nombre))).toBe(false);
  });

  it("cuenta bien los torneos de varios días", () => {
    expect(torneos.filter((t) => t.fechaFin !== t.fechaInicio)).toHaveLength(MULTIDIA);
  });

  it("ignora la rejilla table-bordered: ninguna fila sin nombre o sin fecha", () => {
    for (const t of torneos) {
      expect(t.nombre).not.toBe("");
      expect(t.fechaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.fechaFin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("NO descarta los torneos organizados por la FACV que no son Interclubs", () => {
    // El bug que este test previene: filtrar por organizador en vez de por
    // nombre se llevaría un tercio del calendario (53 de 168 en 2026).
    const deLaFacv = torneos.filter((t) => t.organizador === "FACV");
    expect(deLaFacv).toHaveLength(DE_LA_FACV);
    expect(deLaFacv.map((t) => t.nombre)).toContain("Zonal Jocs. Jornada 1");
    expect(deLaFacv.map((t) => t.nombre)).toContain("Autonómico Circuito Base");
  });

  it("lee bien un torneo de varios días", () => {
    const mutxamel = torneos.find((t) => t.nombre === "Año Nuevo Mutxamel");
    expect(mutxamel).toEqual({
      nombre: "Año Nuevo Mutxamel",
      fechaInicio: "2026-01-02",
      fechaFin: "2026-01-03",
      lugar: "Mutxamel",
      organizador: "C.E. Mutxamel",
    });
  });

  it("en un torneo de un día, fechaFin coincide con fechaInicio", () => {
    const benimaclet = torneos.find((t) => t.nombre === "Open Blitz Benimaclet");
    expect(benimaclet?.fechaInicio).toBe("2026-01-03");
    expect(benimaclet?.fechaFin).toBe("2026-01-03");
  });

  it("decodifica las entidades HTML del nombre", () => {
    // En el HTML viene como "Blitz de L&#039;olleria".
    expect(torneos.map((t) => t.nombre)).toContain("Blitz de L'olleria");
  });

  it("limpia las comas sobrantes del lugar", () => {
    // En el HTML el lugar viene como "Olleria,".
    const olleria = torneos.find((t) => t.nombre === "Blitz de L'olleria");
    expect(olleria?.lugar).toBe("Olleria");
  });

  it("nunca confunde el nombre con la insignia de la columna Bloquea", () => {
    // Las filas bloqueadas llevan un <span>⛔ A nivel Autonómico</span> en la
    // ÚLTIMA celda. Coger el último span de la fila devolvía esa insignia.
    for (const t of torneos) {
      expect(t.nombre).not.toMatch(/[★⛔]/);
      expect(t.nombre).not.toBe("A nivel Autonómico");
      expect(t.nombre).not.toBe("Oficial");
    }
  });

  it("las fechas son coherentes: fin nunca antes que inicio", () => {
    for (const t of torneos) {
      expect(t.fechaFin >= t.fechaInicio).toBe(true);
    }
  });

  it("con HTML vacío o sin tablas devuelve lista vacía en vez de romper", () => {
    expect(parseCalendarioTorneosFACV("")).toEqual([]);
    expect(parseCalendarioTorneosFACV("<html><body><p>nada</p></body></html>")).toEqual([]);
  });
});

describe("deduplicación de torneos que cruzan de mes", () => {
  it("no devuelve la misma clave dos veces", () => {
    const torneos = parseCalendarioTorneosFACV(html);
    const claves = torneos.map(claveFACV);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("un torneo listado en dos meses sale una sola vez", () => {
    // El calendario está partido en una tabla por mes, así que un torneo que
    // empieza a final de mes aparece en las dos tablas. Se simula con dos
    // tablas de datos que contienen la misma fila.
    const fila = `<tr><td>1</td><td><div><span class="badge-oficial">★ Oficial</span><span>Open Que Cruza De Mes</span></div></td><td>30/04/2026</td><td>03/05/2026</td><td>València</td><td>FACV</td><td></td></tr>`;
    const tabla = (f: string) =>
      `<table class="table table-hover align-middle mb-0"><tbody>${f}</tbody></table>`;
    const dosMeses = tabla(fila) + tabla(fila);

    const torneos = parseCalendarioTorneosFACV(dosMeses);
    expect(torneos).toHaveLength(1);
    expect(torneos[0]).toEqual({
      nombre: "Open Que Cruza De Mes",
      fechaInicio: "2026-04-30",
      fechaFin: "2026-05-03",
      lugar: "València",
      organizador: "FACV",
    });
  });
});

describe("claveFACV", () => {
  it("ignora mayúsculas y acentos del nombre", () => {
    expect(claveFACV({ nombre: "Autonómico Circuito Base", fechaInicio: "2026-03-01" })).toBe(
      claveFACV({ nombre: "AUTONOMICO CIRCUITO BASE", fechaInicio: "2026-03-01" })
    );
  });

  it("distingue el mismo torneo en años distintos", () => {
    expect(claveFACV({ nombre: "Open Albal", fechaInicio: "2026-02-01" })).not.toBe(
      claveFACV({ nombre: "Open Albal", fechaInicio: "2027-02-01" })
    );
  });

  it("distingue dos torneos distintos el mismo día", () => {
    expect(claveFACV({ nombre: "Open Blitz Dama Roja", fechaInicio: "2026-01-18" })).not.toBe(
      claveFACV({ nombre: "Blitz de L'olleria", fechaInicio: "2026-01-18" })
    );
  });

  it("el separador evita colisiones si el nombre contiene una fecha", () => {
    expect(claveFACV({ nombre: "Open 2026", fechaInicio: "2026-01-03" })).not.toBe(
      claveFACV({ nombre: "Open", fechaInicio: "2026-2026-01-03" })
    );
  });
});

describe("esJornadaInterclubs", () => {
  it.each([
    ["Interclubs 2026", true],
    ["Interclubs. Jornada 2", true],
    ["Interclubs. Ronda 6 Aplazada", true],
    ["interclubs en minúsculas", true],
    ["Open Blitz Benimaclet", false],
    ["Zonal Jocs. Jornada 1", false],
    ["Copa Federación", false],
    // No empieza por "Interclubs": no es una jornada de la liga.
    ["Memorial Interclubs de Alzira", false],
  ])("%s → %s", (nombre, esperado) => {
    expect(esJornadaInterclubs(nombre)).toBe(esperado);
  });
});
