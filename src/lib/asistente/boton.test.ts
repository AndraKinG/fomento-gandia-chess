import { describe, expect, it } from "vitest";
import {
  clasesBoton,
  clasesPanel,
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
