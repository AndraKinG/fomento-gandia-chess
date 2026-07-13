import { describe, expect, it } from "vitest";
import { parseOrdenFuerza } from "./orden-fuerza-parser";

describe("parseOrdenFuerza", () => {
  it("parsea lineas con ; y con tabulador", () => {
    const r = parseOrdenFuerza(
      "1; Perez Lopez, Ana; 11111111; 22222222\n2\tGarcia Ruiz, Luis\t33333333\t44444444"
    );
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([
      { numero: 1, bisIndex: 0, nombre: "Perez Lopez, Ana", fideId: "11111111", fedaId: "22222222" },
      { numero: 2, bisIndex: 0, nombre: "Garcia Ruiz, Luis", fideId: "33333333", fedaId: "44444444" },
    ]);
  });
  it("soporta numeros bis, incluido 0bis (RGC art. 50.2)", () => {
    const r = parseOrdenFuerza("0bis; Vidal, Marc\n7bis; Soler, Pau; 55555555");
    expect(r.filas[0]).toMatchObject({ numero: 0, bisIndex: 1, nombre: "Vidal, Marc" });
    expect(r.filas[1]).toMatchObject({ numero: 7, bisIndex: 1, fideId: "55555555", fedaId: null });
  });
  it("ignora lineas vacias y reporta lineas invalidas con su numero", () => {
    const r = parseOrdenFuerza("1; Bien, Uno\n\nsin numero valido\n3; Bien, Tres");
    expect(r.filas).toHaveLength(2);
    expect(r.errores).toEqual([{ linea: 3, motivo: "Número de orden no reconocido" }]);
  });
  it("rechaza numeros duplicados", () => {
    const r = parseOrdenFuerza("4; Uno, A\n4; Dos, B");
    expect(r.errores).toEqual([{ linea: 2, motivo: "Número 4 duplicado" }]);
  });
});
