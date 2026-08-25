import { describe, expect, it } from "vitest";
import { enlaceInfo64, terminoDeBusqueda, URL_CALENDARIO_FACV } from "./enlaces-torneo";

describe("terminoDeBusqueda", () => {
  // LOS CUATRO PRIMEROS SON CASOS REALES MEDIDOS contra info64 el 2026-08-16, y el
  // número de resultados de cada uno está en la cabecera del módulo. No son ejemplos
  // inventados: la regla se ajustó a lo que de verdad encuentra cada término.

  it("quita el código de categoría de la FACV", () => {
    // La FACV lo llama "S2400 Oropesa del Mar" y info64 "V IRT-SUB2400 OROPESA DEL
    // MAR": buscando el nombre completo salen CERO. Con el sitio solo, seis.
    expect(terminoDeBusqueda("S2400 Oropesa del Mar")).toBe("Oropesa del Mar");
  });

  it("se para a las dos palabras y no deja el término en una sola", () => {
    // Sin freno esto acaba en "Alicante", que devuelve 152 torneos. Con dos palabras,
    // exactamente uno.
    expect(terminoDeBusqueda("IRT Internacional Alicante")).toBe("Internacional Alicante");
  });

  it("quita edición y palabras genéricas hasta dejar lo que identifica al torneo", () => {
    expect(terminoDeBusqueda("X Open Internacional Ciudad de Sueca")).toBe("Ciudad de Sueca");
    expect(terminoDeBusqueda("Open Rápidas Dama Roja")).toBe("Dama Roja");
  });

  it("quita también la edición en cifra", () => {
    expect(terminoDeBusqueda("2º Open de Gandia")).toBe("de Gandia");
    expect(terminoDeBusqueda("43 Torneo de Verano")).toBe("de Verano");
  });

  it("no toca un nombre que empieza por una fecha", () => {
    // info64 tiene torneos llamados así ("2026-04-28 Sueca"), y el año no es una
    // edición: comerse el "2026" dejaría un término que no es de nadie.
    expect(terminoDeBusqueda("2026-04-28 Sueca")).toBe("2026-04-28 Sueca");
  });

  it("si de tanto recortar no queda nada, busca el nombre entero", () => {
    // Un término de tres letras devuelve media federación.
    expect(terminoDeBusqueda("X Cid")).toBe("X Cid");
  });

  it("normaliza los espacios de sobra", () => {
    expect(terminoDeBusqueda("  Memorial   Paco   Pérez  ")).toBe("Paco Pérez");
  });

  it("deja los acentos, porque info64 busca sin distinguirlos", () => {
    // Comprobado: "Rápidas" y "Rapidas" devuelven los mismos 110 torneos. Quitarlos
    // solo haría que el formulario se viera con el nombre mal escrito.
    expect(terminoDeBusqueda("Memorial Andrés Gómez")).toBe("Andrés Gómez");
  });
});

describe("enlaceInfo64", () => {
  it("usa el campo del formulario de info64, que es `name` y no `q`", () => {
    // `?q=` se ignora y la página contesta "no se han encontrado torneos": se descubrió
    // abriéndola en un navegador, porque los resultados los pinta JavaScript.
    const url = enlaceInfo64("Open de Gandia");
    expect(url.startsWith("https://info64.org/search?name=")).toBe(true);
    expect(url).not.toContain("?q=");
  });

  it("escapa el término: acentos y espacios no rompen la dirección", () => {
    expect(enlaceInfo64("Open Rápidas Dama Roja")).toBe(
      "https://info64.org/search?name=Dama%20Roja"
    );
  });

  it("el calendario de la FACV es el de verdad, no uno inventado", () => {
    expect(URL_CALENDARIO_FACV).toContain("facv.org");
    expect(URL_CALENDARIO_FACV).toContain("calendario_oficial.php");
  });
});
