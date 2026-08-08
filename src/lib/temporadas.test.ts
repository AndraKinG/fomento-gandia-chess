import { describe, expect, it } from "vitest";
import { conTemporada, elegirTemporada, type Temporada } from "./temporadas";

const T2027: Temporada = { id: "t27", nombre: "Interclubs 2027", activa: true };
const T2026: Temporada = { id: "t26", nombre: "Interclubs 2026", activa: false };
const T2025: Temporada = { id: "t25", nombre: "Interclubs 2025", activa: false };
/** Ya ordenadas de más reciente a más antigua, como las devuelve la consulta. */
const TODAS = [T2027, T2026, T2025];

describe("elegirTemporada", () => {
  it("sin parámetro enseña la activa", () => {
    expect(elegirTemporada(TODAS)).toBe(T2027);
  });

  it("con un id válido enseña esa, aunque no sea la activa", () => {
    expect(elegirTemporada(TODAS, "t26")).toBe(T2026);
  });

  it("un id que no existe se cae a la activa en vez de dejar la pantalla vacía", () => {
    // Enlace viejo, temporada borrada o alguien tocando la URL: no debe romperse.
    expect(elegirTemporada(TODAS, "no-existe")).toBe(T2027);
  });

  it("sin ninguna activa se cae a la más reciente", () => {
    const sinActiva = [
      { ...T2027, activa: false },
      T2026,
    ];
    expect(elegirTemporada(sinActiva)?.id).toBe("t27");
  });

  it("un id vacío o nulo se trata como si no viniera", () => {
    expect(elegirTemporada(TODAS, "")).toBe(T2027);
    expect(elegirTemporada(TODAS, null)).toBe(T2027);
    expect(elegirTemporada(TODAS, undefined)).toBe(T2027);
  });

  it("sin temporadas devuelve null", () => {
    expect(elegirTemporada([])).toBeNull();
    expect(elegirTemporada([], "t26")).toBeNull();
  });

  it("con una sola temporada la devuelve, activa o no", () => {
    expect(elegirTemporada([T2026])).toBe(T2026);
  });
});

describe("conTemporada", () => {
  it("en la activa NO añade nada: el enlace se queda limpio", () => {
    expect(conTemporada("/club/equipos", T2027)).toBe("/club/equipos");
  });

  it("en una pasada añade el parámetro", () => {
    expect(conTemporada("/club/equipos", T2026)).toBe("/club/equipos?temporada=t26");
  });

  it("respeta una ruta que ya trae parámetros", () => {
    expect(conTemporada("/club/orden-fuerza?por=elo", T2026)).toBe(
      "/club/orden-fuerza?por=elo&temporada=t26"
    );
  });

  it("sin temporada devuelve la ruta tal cual", () => {
    expect(conTemporada("/club/equipos", null)).toBe("/club/equipos");
  });
});
