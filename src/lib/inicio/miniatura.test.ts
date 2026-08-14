import { describe, expect, it } from "vitest";
import {
  PARTIDA_LEGAL,
  porcentajeDeCasilla,
  posicionEn,
  prepararMiniatura,
} from "./miniatura";

describe("prepararMiniatura", () => {
  const m = prepararMiniatura(PARTIDA_LEGAL);

  it("arranca con las 32 piezas, cada una con su id", () => {
    expect(m.piezas).toHaveLength(32);
    expect(new Set(m.piezas.map((p) => p.id)).size).toBe(32);
  });

  it("saca las trece medias jugadas de la partida de Légal", () => {
    expect(m.jugadas).toHaveLength(13);
    expect(m.jugadas.at(-1)?.san).toBe("Nd5#");
  });

  it("LA MISMA PIEZA CONSERVA SU ID al moverse dos veces", () => {
    // Es lo único que hace que la animación deslice en vez de parpadear: el caballo
    // que va a f3 y luego come en e5 tiene que ser el mismo elemento del DOM.
    const aF3 = m.jugadas.find((j) => j.hasta === "f3" && j.san === "Nf3");
    const comeEnE5 = m.jugadas.find((j) => j.san === "Nxe5");
    expect(aF3).toBeDefined();
    expect(comeEnE5?.id).toBe(aF3?.id);
  });

  it("una captura apunta a la pieza que desaparece", () => {
    const comeEnE5 = m.jugadas.find((j) => j.san === "Nxe5");
    expect(comeEnE5?.comeId).toBeDefined();
    // Lo que había en e5 era el peón negro que salió de e7.
    expect(comeEnE5?.comeId).toContain("P");
  });

  it("la dama sacrificada sale del tablero", () => {
    // Bxd1 se come la dama blanca: la gracia de esta partida es justo esa.
    const { comidas, casillas } = posicionEn(m, m.jugadas.length);
    const damaBlanca = m.piezas.find((p) => p.id === "d1-wQ");
    expect(damaBlanca).toBeDefined();
    expect(comidas.has(damaBlanca!.id)).toBe(true);
    // Y el alfil negro que la comió acabó en d1.
    expect(Object.values(casillas)).toContain("d1");
  });

  it("una jugada ilegal corta la secuencia en vez de reventar", () => {
    const roto = prepararMiniatura(["e4", "e5", "Qh9"]);
    expect(roto.jugadas).toHaveLength(2);
  });
});

describe("prepararMiniatura: casos raros del ajedrez", () => {
  it("el enroque mueve TAMBIÉN la torre, como jugada propia", () => {
    // chess.js lo cuenta como una sola jugada del rey. Sin esto, la torre se quedaría
    // clavada en h1 mientras el rey salta a g1.
    const m = prepararMiniatura(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]);
    const ultima = m.jugadas.at(-1);
    expect(ultima?.desde).toBe("h1");
    expect(ultima?.hasta).toBe("f1");
    const rey = m.jugadas.at(-2);
    expect(rey?.desde).toBe("e1");
    expect(rey?.hasta).toBe("g1");
  });

  it("al paso saca al peón de al lado, no al de la casilla de destino", () => {
    // Sin este caso, el peón capturado al paso se quedaba en el tablero para siempre:
    // la casilla donde muere no es a la que va el que come.
    const m = prepararMiniatura(["e4", "a6", "e5", "d5", "exd6"]);
    const alPaso = m.jugadas.at(-1);
    expect(alPaso?.hasta).toBe("d6");
    // El peón negro estaba en d5, no en d6.
    expect(alPaso?.comeId).toBe("d7-bP");
  });

  it("coronar cambia el sprite de la misma pieza", () => {
    const m = prepararMiniatura([
      "e4", "d5", "exd5", "Nf6", "d6", "Nc6", "dxc7", "Nb4", "cxd8=Q",
    ]);
    const corona = m.jugadas.at(-1);
    expect(corona?.spriteNuevo).toBe("wQ");
    const { sprites } = posicionEn(m, m.jugadas.length);
    expect(sprites[corona!.id]).toBe("wQ");
  });
});

describe("posicionEn", () => {
  const m = prepararMiniatura(PARTIDA_LEGAL);

  it("en la jugada 0 todo está en su sitio de salida", () => {
    const { casillas, comidas } = posicionEn(m, 0);
    expect(comidas.size).toBe(0);
    expect(casillas["e2-wP"]).toBe("e2");
  });

  it("va hacia atrás igual que hacia delante", () => {
    // El scroll sube y baja, así que cada paso se recalcula entero desde el principio
    // en vez de aplicar diferencias: con diferencias, subir dejaría el tablero mal.
    const ida = posicionEn(m, 4);
    const vuelta = posicionEn(m, 4);
    expect(ida).toEqual(vuelta);
    expect(posicionEn(m, 1).casillas["e2-wP"]).toBe("e4");
    expect(posicionEn(m, 0).casillas["e2-wP"]).toBe("e2");
  });

  it("pedir más jugadas de las que hay no se sale", () => {
    expect(() => posicionEn(m, 999)).not.toThrow();
    expect(() => posicionEn(m, -5)).not.toThrow();
  });
});

describe("porcentajeDeCasilla", () => {
  it("a8 es la esquina de arriba a la izquierda, con blancas abajo", () => {
    expect(porcentajeDeCasilla("a8")).toEqual({ x: 0, y: 0 });
  });

  it("h1 es la de abajo a la derecha", () => {
    expect(porcentajeDeCasilla("h1")).toEqual({ x: 87.5, y: 87.5 });
  });

  it("e4 cae donde tiene que caer", () => {
    expect(porcentajeDeCasilla("e4")).toEqual({ x: 50, y: 50 });
  });
});
