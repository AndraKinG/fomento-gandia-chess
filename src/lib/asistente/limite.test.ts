import { describe, expect, it } from "vitest";
import { Freno, TOPE, VENTANA_MS } from "./limite";

describe("Freno", () => {
  it("deja pasar una conversación normal", () => {
    const f = new Freno();
    for (let i = 0; i < TOPE; i++) {
      expect(f.pasado("socio", 1000)).toBe(false);
    }
  });

  it("corta al pasarse del tope", () => {
    const f = new Freno();
    for (let i = 0; i < TOPE; i++) f.pasado("socio", 1000);
    expect(f.pasado("socio", 1000)).toBe(true);
  });

  it("no mezcla a dos socios", () => {
    // Por socio y no por IP: dos del club en el mismo local no se estorban.
    const f = new Freno();
    for (let i = 0; i < TOPE + 5; i++) f.pasado("uno", 1000);
    expect(f.pasado("otro", 1000)).toBe(false);
  });

  it("perdona cuando pasa la ventana", () => {
    const f = new Freno();
    for (let i = 0; i < TOPE + 5; i++) f.pasado("socio", 1000);
    expect(f.pasado("socio", 1000 + VENTANA_MS + 1)).toBe(false);
  });

  it("olvida a quien ya no vuelve", () => {
    // Si no, el mapa crece con cada socio que pasa y no se vacía nunca.
    const f = new Freno();
    f.pasado("viejo", 1000);
    f.pasado("nuevo", 1000 + VENTANA_MS + 1);
    // El único rastro de "viejo" tendría que haberse ido: se comprueba de la única
    // forma observable, que su cuenta arranque otra vez de cero.
    for (let i = 0; i < TOPE; i++) {
      expect(f.pasado("viejo", 1000 + VENTANA_MS + 2)).toBe(false);
    }
  });
});
