import { describe, expect, it } from "vitest";
import {
  BIS_MANUAL_DESDE,
  colocarFichaManual,
  primerBisLibre,
  type FilaOrden,
} from "./colocar-ficha";

/** Orden de ejemplo: cuatro números publicados, de más fuerte a menos. */
const ORDEN: FilaOrden[] = [
  { numero: 1, bisIndex: 0, eloOficial: 2100 },
  { numero: 2, bisIndex: 0, eloOficial: 1950 },
  { numero: 3, bisIndex: 0, eloOficial: 1800 },
  { numero: 4, bisIndex: 0, eloOficial: 1650 },
];

const sinElo = { eloFide: null, eloFeda: null, eloOtro: null };

describe("colocarFichaManual", () => {
  it("coloca la ficha detrás del último que es igual o más fuerte", () => {
    // 1875 está entre el nº2 (1950) y el nº3 (1800): va como bis del 2.
    expect(colocarFichaManual(ORDEN, { ...sinElo, eloFide: 1875 })).toEqual({
      numero: 2,
      bisIndex: BIS_MANUAL_DESDE,
    });
  });

  it("con el mismo ELO que uno publicado, va detrás de él y no delante", () => {
    expect(colocarFichaManual(ORDEN, { ...sinElo, eloFide: 1800 })).toEqual({
      numero: 3,
      bisIndex: BIS_MANUAL_DESDE,
    });
  });

  it("el más débil va al final", () => {
    expect(colocarFichaManual(ORDEN, { ...sinElo, eloFide: 1400 })).toEqual({
      numero: 4,
      bisIndex: BIS_MANUAL_DESDE,
    });
  });

  it("el más fuerte del club NO adelanta al número 1", () => {
    // Decisión consciente: el orden publicado manda en las convocatorias, y
    // adelantar a alguien por decisión de la app seria inventarse el reglamento.
    expect(colocarFichaManual(ORDEN, { ...sinElo, eloFide: 2400 })).toEqual({
      numero: 1,
      bisIndex: BIS_MANUAL_DESDE,
    });
  });

  it("usa el ELO del RGC: el mayor entre FEDA y FIDE", () => {
    // FEDA 1990 manda sobre FIDE 1700, así que va como bis del nº1 (2100 > 1990).
    expect(
      colocarFichaManual(ORDEN, { eloFide: 1700, eloFeda: 1990, eloOtro: null })
    ).toEqual({ numero: 1, bisIndex: BIS_MANUAL_DESDE });
  });

  it("sin ELO oficial usa el estimado", () => {
    expect(
      colocarFichaManual(ORDEN, { eloFide: null, eloFeda: null, eloOtro: 1700 })
    ).toEqual({ numero: 3, bisIndex: BIS_MANUAL_DESDE });
  });

  it("sin ningún ELO cae al 1400 del reglamento y va al final", () => {
    expect(colocarFichaManual(ORDEN, sinElo)).toEqual({
      numero: 4,
      bisIndex: BIS_MANUAL_DESDE,
    });
  });

  it("con el orden vacío abre la lista en el número 1", () => {
    expect(colocarFichaManual([], { ...sinElo, eloFide: 1500 })).toEqual({
      numero: 1,
      bisIndex: 0,
    });
  });

  it("no le importa el orden en que lleguen las filas", () => {
    const revuelto = [...ORDEN].reverse();
    expect(colocarFichaManual(revuelto, { ...sinElo, eloFide: 1875 })).toEqual(
      colocarFichaManual(ORDEN, { ...sinElo, eloFide: 1875 })
    );
  });

  it("una fila publicada sin ELO no se cuela por delante", () => {
    // `eloOficial` es nullable en la base: tratarlo como 0 la deja al final de las
    // comparaciones, que es lo prudente.
    const conHueco: FilaOrden[] = [
      { numero: 1, bisIndex: 0, eloOficial: null },
      { numero: 2, bisIndex: 0, eloOficial: 1900 },
    ];
    expect(colocarFichaManual(conHueco, { ...sinElo, eloFide: 1950 })).toEqual({
      numero: 1,
      bisIndex: BIS_MANUAL_DESDE,
    });
  });
});

describe("primerBisLibre", () => {
  it("empieza en la franja reservada a las manuales, no en 1", () => {
    // Importa: la FACV usa bis 0 y 1, y una manual sentada en un bis que la FACV
    // luego asigne haría fallar la sincronización con clave duplicada.
    expect(primerBisLibre(ORDEN, 2)).toBe(BIS_MANUAL_DESDE);
  });

  it("salta los que ya están ocupados por otras manuales", () => {
    const conManuales: FilaOrden[] = [
      ...ORDEN,
      { numero: 2, bisIndex: BIS_MANUAL_DESDE, eloOficial: 1900 },
      { numero: 2, bisIndex: BIS_MANUAL_DESDE + 1, eloOficial: 1880 },
    ];
    expect(primerBisLibre(conManuales, 2)).toBe(BIS_MANUAL_DESDE + 2);
  });

  it("no le afectan los bis de otros números", () => {
    const conManuales: FilaOrden[] = [
      ...ORDEN,
      { numero: 3, bisIndex: BIS_MANUAL_DESDE, eloOficial: 1790 },
    ];
    expect(primerBisLibre(conManuales, 2)).toBe(BIS_MANUAL_DESDE);
  });

  it("convive con un bis 1 de la propia FACV", () => {
    const conBisFacv: FilaOrden[] = [
      ...ORDEN,
      { numero: 2, bisIndex: 1, eloOficial: 1930 },
    ];
    expect(primerBisLibre(conBisFacv, 2)).toBe(BIS_MANUAL_DESDE);
  });
});
