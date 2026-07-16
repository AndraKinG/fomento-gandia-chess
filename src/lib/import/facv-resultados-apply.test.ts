import { describe, expect, it } from "vitest";
import { decidirEncuentro } from "./facv-resultados-apply";

// Decisión PURA (sin I/O) sobre qué hacer con un encuentro al sincronizar
// resultados FACV (Task 8 fix round 1, finding 3): extraída de
// `sincronizarResultadosFACVCore` para poder testearla sin mockear Supabase.
describe("decidirEncuentro", () => {
  it("sin resultados por tablero (encuentro sin convocatoria/boards): escribe marcador FACV y no hay discrepancia", () => {
    const decision = decidirEncuentro({
      marcadorPropioFACV: 4.5,
      marcadorRivalFACV: 3.5,
      resultadosTablero: [],
      totalTableros: 0,
      marcadorPropioExistente: null,
      marcadorRivalExistente: null,
    });

    expect(decision).toEqual({
      escribir: true,
      marcadorPropio: 4.5,
      marcadorRival: 3.5,
    });
  });

  it("marcador ya guardado en una sync anterior (sin boards): omite sin discrepancia, no lo vuelve a tocar", () => {
    const decision = decidirEncuentro({
      marcadorPropioFACV: 4.5,
      marcadorRivalFACV: 3.5,
      resultadosTablero: [],
      totalTableros: 0,
      marcadorPropioExistente: 4.5,
      marcadorRivalExistente: 3.5,
    });

    expect(decision).toEqual({ escribir: false, discrepancia: null });
  });

  it("boards incompletos (el capitán aún está anotando): omite, sin discrepancia", () => {
    const decision = decidirEncuentro({
      marcadorPropioFACV: 4.5,
      marcadorRivalFACV: 3.5,
      resultadosTablero: [1, 0.5, 1], // solo 3 de 8 tableros anotados
      totalTableros: 8,
      marcadorPropioExistente: null,
      marcadorRivalExistente: null,
    });

    expect(decision).toEqual({ escribir: false, discrepancia: null });
  });

  it("boards completos y coinciden con FACV: omite, sin discrepancia", () => {
    const resultadosTablero = [1, 1, 0.5, 0, 1, 0.5, 0, 0.5]; // suma 4.5, 8 tableros
    const decision = decidirEncuentro({
      marcadorPropioFACV: 4.5,
      marcadorRivalFACV: 3.5,
      resultadosTablero,
      totalTableros: 8,
      marcadorPropioExistente: null,
      marcadorRivalExistente: null,
    });

    expect(decision).toEqual({ escribir: false, discrepancia: null });
  });

  it("boards completos pero NO coinciden con FACV: omite (el dato del capitán prevalece) y añade discrepancia", () => {
    const resultadosTablero = [1, 1, 1, 1, 1, 1, 1, 1]; // suma 8, no 4.5
    const decision = decidirEncuentro({
      marcadorPropioFACV: 4.5,
      marcadorRivalFACV: 3.5,
      resultadosTablero,
      totalTableros: 8,
      marcadorPropioExistente: null,
      marcadorRivalExistente: null,
    });

    expect(decision).toEqual({
      escribir: false,
      discrepancia: { nuestro: 8, rival: 0 },
    });
  });
});
