import { describe, expect, it } from "vitest";
import {
  mensaje,
  mensajeApp,
  mensajeJornada,
  mensajeTorneoClub,
  mensajeTorneoFuera,
} from "./mensaje";

const URL = "https://fomento-gandia-chess-swart.vercel.app/club/torneos/facv/abc";

describe("mensaje", () => {
  it("junta título, líneas y enlace", () => {
    expect(mensaje("Título", ["una", "dos"], URL)).toBe(`Título\nuna\ndos\n\n${URL}`);
  });

  it("tira las líneas que no son texto", () => {
    // Los datos vienen de la base y la mitad son opcionales: sin esto salían huecos.
    expect(mensaje("T", ["una", null, undefined, false, "  ", "dos"], URL)).toBe(
      `T\nuna\ndos\n\n${URL}`
    );
  });

  it("deja SIEMPRE una línea en blanco antes del enlace", () => {
    // Pegado al texto, WhatsApp se traga el último carácter dentro del enlace.
    expect(mensaje("T", ["algo"], URL).endsWith(`\n\n${URL}`)).toBe(true);
  });

  it("un mensaje sin líneas sigue siendo válido", () => {
    expect(mensaje("Solo el título", [], URL)).toBe(`Solo el título\n\n${URL}`);
  });
});

describe("mensajeTorneoFuera", () => {
  const base = {
    nombre: "Open Ciutat de Sueca",
    fechas: "4 y 5 de octubre",
    lugar: "Sueca",
    hora: "09:30",
    van: 6,
    plazasLibres: 2,
    url: URL,
  };

  it("lleva lo que decide si alguien se apunta", () => {
    const t = mensajeTorneoFuera(base);
    expect(t).toContain("♟️ Open Ciutat de Sueca");
    expect(t).toContain("📅 4 y 5 de octubre · 09:30");
    expect(t).toContain("📍 Sueca");
    expect(t).toContain("Vamos 6 del club.");
    expect(t).toContain("Quedan 2 plazas en coche.");
    expect(t).toContain("¿Te apuntas?");
  });

  it("una plaza se dice en singular", () => {
    expect(mensajeTorneoFuera({ ...base, plazasLibres: 1 })).toContain("Queda 1 plaza en coche.");
  });

  it("sin nadie apuntado y sin coche, no se inventa nada", () => {
    const t = mensajeTorneoFuera({ ...base, van: 0, plazasLibres: 0 });
    expect(t).not.toContain("Vamos");
    expect(t).not.toContain("plaza");
    // Pero la invitación se queda: es el objetivo del mensaje.
    expect(t).toContain("¿Te apuntas?");
  });

  it("sin hora ni lugar no deja el separador suelto", () => {
    const t = mensajeTorneoFuera({ ...base, hora: null, lugar: null });
    expect(t).toContain("📅 4 y 5 de octubre\n");
    expect(t).not.toContain("·");
    expect(t).not.toContain("📍");
  });
});

describe("mensajeTorneoClub", () => {
  it("un torneo abierto llama a apuntarse", () => {
    const t = mensajeTorneoClub({
      nombre: "Rápidas de otoño",
      sistema: "suizo",
      fecha: "12 de octubre",
      inscritos: 9,
      abierto: true,
      url: URL,
    });
    expect(t).toContain("Torneo del club · Sistema suizo");
    expect(t).toContain("Ya hay 9 inscritos.");
    expect(t).toContain("Apúntate desde la app.");
  });

  it("uno en marcha manda a mirar la clasificación, no a apuntarse", () => {
    const t = mensajeTorneoClub({
      nombre: "Social",
      sistema: "liguilla",
      fecha: null,
      inscritos: 1,
      abierto: false,
      url: URL,
    });
    expect(t).toContain("Hay 1 inscrito.");
    expect(t).toContain("Sigue la clasificación en la app.");
    expect(t).not.toContain("Apúntate");
  });
});

describe("mensajeJornada", () => {
  it("dice si se juega en casa o fuera", () => {
    expect(
      mensajeJornada({
        equipo: "Fomento de Gandia A",
        rival: "Ateneo Elx",
        esLocal: true,
        fecha: "sábado 10 de enero, 17:00",
        sede: "Poliesportiu de Gandia",
        url: URL,
      })
    ).toContain("🛡️ Fomento de Gandia A · contra Ateneo Elx");

    expect(
      mensajeJornada({
        equipo: "Fomento de Gandia B",
        rival: "Capablanca",
        esLocal: false,
        fecha: "sábado 10 de enero, 17:00",
        sede: null,
        url: URL,
      })
    ).toContain("· fuera contra Capablanca");
  });
});

describe("mensajeApp", () => {
  it("se explica sin abrir el enlace", () => {
    const t = mensajeApp("https://fomento-gandia-chess-swart.vercel.app");
    expect(t).toContain("La app del Club de Ajedrez Fomento de Gandia");
    expect(t).toContain("código del club");
    expect(t.endsWith("https://fomento-gandia-chess-swart.vercel.app")).toBe(true);
  });
});
