import { describe, expect, it } from "vitest";
import {
  aPixeles,
  clasesBoton,
  clasesPanel,
  esArrastre,
  LADO_BOTON,
  ladoDelPanel,
  panelHaciaAbajo,
  posicionGuardada,
  sujetar,
  seVeElBoton,
  SITIOS,
  sitioBoton,
  SITIO_POR_DEFECTO,
} from "./boton";

describe("sitioBoton", () => {
  it("sin elegir nada, el botón se queda donde estaba", () => {
    // Las 46 cuentas tienen la columna a null: no se les puede mover el botón por
    // haber añadido un ajuste.
    expect(sitioBoton(null)).toBe(SITIO_POR_DEFECTO);
    expect(sitioBoton(undefined)).toBe("derecha");
  });

  it("un valor raro no rompe la pantalla", () => {
    expect(sitioBoton("arriba-del-todo")).toBe("derecha");
  });

  it("respeta lo que el socio eligió", () => {
    expect(sitioBoton("izquierda")).toBe("izquierda");
    expect(sitioBoton("oculto")).toBe("oculto");
  });
});

describe("seVeElBoton", () => {
  it("solo lo esconde quien lo ha pedido", () => {
    expect(seVeElBoton(null)).toBe(true);
    expect(seVeElBoton("izquierda")).toBe(true);
    expect(seVeElBoton("oculto")).toBe(false);
  });
});

describe("las clases de posición", () => {
  // Una clase mal escrita no falla en ningún sitio: el botón se va a una esquina que
  // no toca y solo se descubre mirándolo.

  it("cada lado ancla a SU borde y a ninguno más", () => {
    expect(clasesBoton("derecha")).toContain("right-4");
    expect(clasesBoton("derecha")).not.toContain("left-");
    expect(clasesBoton("izquierda")).toContain("left-4");
    expect(clasesBoton("izquierda")).not.toContain("right-");
  });

  it("la ventana se abre por el mismo lado que su botón", () => {
    // Abrirse por el lado contrario al que has tocado se lee como que has abierto
    // otra cosa.
    expect(clasesPanel("izquierda")).toContain("left");
    expect(clasesPanel("izquierda")).not.toContain("right");
    expect(clasesPanel("derecha")).toContain("right");
    expect(clasesPanel("derecha")).not.toContain("left");
  });

  it("en móvil el botón sube por encima de la barra inferior", () => {
    // Sin esto queda debajo del menú y no se puede tocar.
    for (const s of ["derecha", "izquierda"] as const) {
      expect(clasesBoton(s)).toContain("bottom-24");
      expect(clasesBoton(s)).toContain("lg:bottom-6");
    }
  });
});

describe("el catálogo de opciones", () => {
  it("no hay dos opciones con la misma clave", () => {
    expect(new Set(SITIOS.map((s) => s.clave)).size).toBe(SITIOS.length);
  });

  it("todas se pueden elegir de verdad", () => {
    for (const s of SITIOS) expect(sitioBoton(s.clave)).toBe(s.clave);
  });
});

describe("arrastrar el botón (migración 0045)", () => {
  it("un dedo que tiembla sigue siendo un toque", () => {
    // Sin umbral el chat no se abriría NUNCA: nadie toca del todo quieto.
    expect(esArrastre(0, 0)).toBe(false);
    expect(esArrastre(3, 2)).toBe(false);
  });

  it("mover el dedo de verdad es un arrastre", () => {
    expect(esArrastre(0, 12)).toBe(true);
    expect(esArrastre(-20, 5)).toBe(true);
  });

  it("hacen falta las dos coordenadas: media posición no es una posición", () => {
    expect(posicionGuardada(0.3, null)).toBeNull();
    expect(posicionGuardada(null, null)).toBeNull();
    expect(posicionGuardada(0.3, 0.8)).toEqual({ x: 0.3, y: 0.8 });
  });

  it("una posición fuera de la pantalla se descarta", () => {
    // Un botón fuera de cuadro no se puede volver a coger para traerlo.
    expect(posicionGuardada(1.4, 0.5)).toBeNull();
    expect(posicionGuardada(0.5, -0.2)).toBeNull();
  });

  it("al soltar, el botón se queda ENTERO dentro de la pantalla", () => {
    const p = sujetar(-500, 5000, 400, 800);
    const { x, y } = aPixeles(p, 400, 800);
    const mitad = LADO_BOTON / 2;
    expect(x - mitad).toBeGreaterThanOrEqual(0);
    expect(x + mitad).toBeLessThanOrEqual(400);
    expect(y - mitad).toBeGreaterThanOrEqual(0);
    expect(y + mitad).toBeLessThanOrEqual(800);
  });

  it("soltarlo en medio lo deja donde se soltó", () => {
    expect(sujetar(200, 400, 400, 800)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("guardado en fracciones, el sitio se conserva al cambiar de pantalla", () => {
    // Es el motivo de no guardar píxeles: lo elegido en el monitor tiene que seguir
    // teniendo sentido en el móvil.
    const p = sujetar(960, 400, 1920, 800);
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(aPixeles(p, 390, 780).x).toBeCloseTo(195, 5);
  });

  it("la ventana del chat se abre hacia dentro, nunca hacia el borde", () => {
    expect(ladoDelPanel({ x: 0.9, y: 0.5 })).toBe("derecha");
    expect(ladoDelPanel({ x: 0.1, y: 0.5 })).toBe("izquierda");
    expect(panelHaciaAbajo({ x: 0.5, y: 0.1 })).toBe(true);
    expect(panelHaciaAbajo({ x: 0.5, y: 0.9 })).toBe(false);
  });
});
