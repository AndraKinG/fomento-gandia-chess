import { describe, expect, it } from "vitest";
import { inicioDelTrozo, partirEnDos } from "./columnas";

const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("partirEnDos", () => {
  it("no parte una lista corta", () => {
    // Dos columnas de tres filas no ganan nada y se leen en zigzag.
    expect(partirEnDos(lista(6))).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("no parte justo en el mínimo", () => {
    expect(partirEnDos(lista(24))).toHaveLength(1);
  });

  it("parte en cuanto se pasa del mínimo", () => {
    expect(partirEnDos(lista(25))).toHaveLength(2);
  });

  it("con número par deja las dos columnas iguales", () => {
    const [a, b] = partirEnDos(lista(46));
    expect(a).toHaveLength(23);
    expect(b).toHaveLength(23);
    expect(b[0]).toBe(24);
  });

  it("con número impar la columna larga es la primera", () => {
    // Se llena la izquierda y luego la derecha, que es como se lee.
    const [a, b] = partirEnDos(lista(47));
    expect(a).toHaveLength(24);
    expect(b).toHaveLength(23);
  });

  it("no pierde ni repite ningún elemento", () => {
    expect(partirEnDos(lista(47)).flat()).toEqual(lista(47));
  });

  it("acepta un mínimo propio", () => {
    expect(partirEnDos(lista(10), 4)).toHaveLength(2);
  });

  it("una lista vacía sigue dando un trozo, no cero", () => {
    // Quien lo pinta recorre los trozos sin ramificar.
    expect(partirEnDos([])).toEqual([[]]);
  });
});

describe("inicioDelTrozo", () => {
  it("el primero empieza en cero", () => {
    expect(inicioDelTrozo(partirEnDos(lista(46)), 0)).toBe(0);
  });

  it("el segundo empieza donde acaba el primero", () => {
    // Sin esto, la numeración de la segunda columna volvería a empezar por 1.
    expect(inicioDelTrozo(partirEnDos(lista(47)), 1)).toBe(24);
  });
});
