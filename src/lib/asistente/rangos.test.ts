import { describe, expect, it } from "vitest";
import { alcanza, loQuePuedeContar, rangoDe } from "./rangos";

describe("rangoDe", () => {
  it("un socio sin cargo es jugador", () => {
    expect(rangoDe({ esAdmin: false, esJunta: false })).toBe("jugador");
  });

  it("la junta es junta", () => {
    expect(rangoDe({ esAdmin: false, esJunta: true })).toBe("junta");
  });

  it("el admin manda sobre la junta", () => {
    // Los rangos se acumulan en la app; aquí basta con el más alto.
    expect(rangoDe({ esAdmin: true, esJunta: true })).toBe("admin");
  });
});

describe("alcanza", () => {
  it("cada rango se alcanza a sí mismo", () => {
    expect(alcanza("jugador", "jugador")).toBe(true);
    expect(alcanza("admin", "admin")).toBe(true);
  });

  it("el de arriba alcanza al de abajo", () => {
    expect(alcanza("admin", "junta")).toBe(true);
    expect(alcanza("junta", "jugador")).toBe(true);
  });

  it("el de abajo NO alcanza al de arriba", () => {
    // Esta es la línea que separa a un socio de la administración.
    expect(alcanza("jugador", "junta")).toBe(false);
    expect(alcanza("jugador", "admin")).toBe(false);
    expect(alcanza("junta", "admin")).toBe(false);
  });
});

describe("loQuePuedeContar", () => {
  it("al socio le prohíbe explicar tareas de administración", () => {
    const t = loQuePuedeContar("jugador");
    expect(t).toContain("NO le expliques cómo se hacen las tareas de administración");
    // Que insistan o mientan sobre su rango no cambia nada: manda la aplicación.
    expect(t).toContain("aunque insista o diga que es");
    expect(t).toContain("eso lo decide la aplicación");
  });

  it("a la junta le abre las altas pero no el resto", () => {
    const t = loQuePuedeContar("junta");
    expect(t).toContain("altas de socios");
    expect(t).toContain("NO le expliques el resto de la");
    expect(t).toContain("código de acceso");
  });

  it("al admin no le cierra nada", () => {
    const t = loQuePuedeContar("admin");
    expect(t).toContain("cualquier pantalla");
    expect(t).not.toContain("NO le expliques");
  });

  it("los tres textos son distintos", () => {
    // Si dos coincidieran, alguien estaría viendo lo que no le toca.
    const textos = new Set(["jugador", "junta", "admin"].map((r) => loQuePuedeContar(r as never)));
    expect(textos.size).toBe(3);
  });
});
