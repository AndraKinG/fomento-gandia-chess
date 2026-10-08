import { describe, expect, it } from "vitest";
import {
  esEnlaceChessPairings,
  idDesdeEnlace,
  pedirChessPairings,
  resolverEnlacePublico,
  resultadoDesdeBlancas,
} from "./chesspairings";

describe("resultadoDesdeBlancas", () => {
  it("traduce su notación a la de la app", () => {
    // Medida en un torneo real de ChessPairings, no adivinada.
    expect(resultadoDesdeBlancas("1-0")).toBe("1");
    expect(resultadoDesdeBlancas("0-1")).toBe("0");
    expect(resultadoDesdeBlancas("1/2-1/2")).toBe("0.5");
  });

  it("sin jugar es null, y NO son tablas", () => {
    // Es el fallo que no se ve: una ronda en marcha tiene los resultados vacíos, y
    // pintarlos como ½ daría puntos que nadie ha hecho, con la clasificación entera con
    // pinta de correcta.
    expect(resultadoDesdeBlancas(null)).toBeNull();
    expect(resultadoDesdeBlancas("")).toBeNull();
    expect(resultadoDesdeBlancas(undefined)).toBeNull();
  });

  it("el bye no es una partida con resultado", () => {
    expect(resultadoDesdeBlancas("+--")).toBeNull();
  });

  it("aguanta las otras formas de escribir unas tablas", () => {
    expect(resultadoDesdeBlancas("½-½")).toBe("0.5");
    expect(resultadoDesdeBlancas("0.5-0.5")).toBe("0.5");
  });
});

describe("idDesdeEnlace", () => {
  it("saca el id del enlace público", () => {
    expect(
      idDesdeEnlace("https://my.chesspairings.org/pubblico/torneo.php?id=5759&token=abc")
    ).toBe(5759);
  });

  it("vale aunque el enlace esté a medias, porque el id es lo único que usamos", () => {
    // Caso real: se pegó sin el `/pubblico/` y funcionó porque el id estaba.
    expect(idDesdeEnlace("https://my.chesspairings.org/torneo.php?id=5759")).toBe(5759);
  });

  it("un enlace sin id no es de un torneo", () => {
    // Guardarlo sin más deja una pantalla que no trae nada y parece que está roto.
    expect(idDesdeEnlace("https://my.chesspairings.org/")).toBeNull();
    expect(idDesdeEnlace(null)).toBeNull();
    expect(idDesdeEnlace("")).toBeNull();
  });
});

describe("resolverEnlacePublico", () => {
  it("un enlace que ya trae el id se devuelve tal cual, sin pedir nada", async () => {
    // SIN RED: es la mitad de la gracia. El caso normal —alguien pega la dirección
    // larga— no puede depender de que chesspairings responda.
    const largo = "https://my.chesspairings.org/pubblico/torneo.php?id=7001&token=abc";
    expect(await resolverEnlacePublico(largo)).toBe(largo);
  });

  it("si no se puede seguir el atajo, devuelve lo que había", async () => {
    // Quien llama ya comprueba que haya id y da su mensaje: una caída de su web no debe
    // convertirse aquí en un fallo distinto.
    const corto = "https://no-existe.invalido/t.php?c=XXXX";
    expect(await resolverEnlacePublico(corto)).toBe(corto);
  });
});

/**
 * LO QUE EL SERVIDOR ESTÁ DISPUESTO A PEDIR (auditoría del 2026-10-08).
 *
 * Los casos de abajo no son inventados para rellenar: son las formas conocidas de colar
 * otra dirección dentro de una URL que "parece" de ChessPairings. Si alguno pasara, el
 * servidor pediría esa dirección cada vez que alguien abriera el torneo.
 */
describe("esEnlaceChessPairings", () => {
  it("los dos enlaces de verdad pasan: el largo y el atajo de compartir", () => {
    expect(
      esEnlaceChessPairings("https://my.chesspairings.org/pubblico/torneo.php?id=7001&token=abc")
    ).toBe(true);
    expect(esEnlaceChessPairings("https://my.chesspairings.org/t.php?c=BGSKRBCQ")).toBe(true);
  });

  it("la condición vieja —llevar ?id=— ya no basta", () => {
    expect(esEnlaceChessPairings("http://servicio-interno/?id=1")).toBe(false);
    expect(esEnlaceChessPairings("http://169.254.169.254/latest/meta-data/?id=1")).toBe(false);
    expect(esEnlaceChessPairings("http://localhost:3000/api/cron/director?id=1")).toBe(false);
  });

  it("el dominio bueno como TEXTO no engaña: se mira a dónde va de verdad", () => {
    // Todo lo que va antes de la @ es usuario, no dominio: esto va a otro.sitio.
    expect(esEnlaceChessPairings("https://my.chesspairings.org@otro.sitio/?id=1")).toBe(false);
    expect(esEnlaceChessPairings("https://my.chesspairings.org.otro.sitio/?id=1")).toBe(false);
    expect(esEnlaceChessPairings("https://otro.sitio/my.chesspairings.org?id=1")).toBe(false);
    expect(esEnlaceChessPairings("https://evilmy.chesspairings.org/?id=1")).toBe(false);
  });

  it("sin https, con otro puerto o con credenciales, tampoco", () => {
    expect(esEnlaceChessPairings("http://my.chesspairings.org/?id=1")).toBe(false);
    expect(esEnlaceChessPairings("https://my.chesspairings.org:8080/?id=1")).toBe(false);
    expect(esEnlaceChessPairings("https://usuario:clave@my.chesspairings.org/?id=1")).toBe(false);
  });

  it("lo que no es una URL no rompe nada", () => {
    expect(esEnlaceChessPairings(null)).toBe(false);
    expect(esEnlaceChessPairings("")).toBe(false);
    expect(esEnlaceChessPairings("no es una url")).toBe(false);
  });
});

describe("pedirChessPairings", () => {
  it("una dirección de fuera ni se intenta pedir", async () => {
    // SIN RED: si llegara a hacer la petición, este test tardaría o fallaría distinto.
    // Lo que se comprueba es que se corta ANTES de salir.
    expect(await pedirChessPairings("http://servicio-interno/?id=1")).toBeNull();
    expect(await pedirChessPairings("https://my.chesspairings.org@otro.sitio/")).toBeNull();
  });
});
