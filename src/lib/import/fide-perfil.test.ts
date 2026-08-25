import { describe, expect, it } from "vitest";
import { parsearPerfilFide, textoVariacion } from "./fide-perfil";

/**
 * HTML REAL de perfiles de socios del club, recortado a la fila de ratings (leído de
 * ratings.fide.com el 2026-08-16). No son ejemplos inventados: la gracia de estos tests
 * es cazar el día que la FIDE cambie su página.
 */

// Santiago García Coll: clásicas con subida, rápidas y blitz sin variación.
const CON_SUBIDA = `
<div class="profile-games "> <div class="profile-standart profile-game ">
<img src="/img/logo_std.svg" alt="standart" height=25> <p>1948</p>
<p style="font-size: 8px;">STANDARD <span class=inactiv_note></span></p>
<span class="profile-top-rating-dataDesc">Expected<br><i class="fa fa-angle-up color_grn" aria-hidden="true"></i> 5</span> </div>
<div class="profile-rapid profile-game "> <img src="/img/logo_rpd.svg" alt="rapid" height=25>
<p>1864</p><p style="font-size: 8px;">RAPID<span class=inactiv_note></p> </div>
<div class="profile-blitz profile-game "> <img src="/img/logo_blitz.svg " alt="blitz" height=25>
<p>1759</p><p style="font-size: 8px;">BLITZ<span class=inactiv_note></p> </div>
<!--profile-games--> </div>`;

// Malte Mauelshagen: clásicas BAJANDO, con decimales, y sin blitz.
const CON_BAJADA = `
<div class="profile-games "> <div class="profile-standart profile-game ">
<img src="/img/logo_std.svg" alt="standart" height=25> <p>1880</p>
<p style="font-size: 8px;">STANDARD</p>
<span class="profile-top-rating-dataDesc">Expected<br><i class="fa fa-angle-down color_rd" aria-hidden="true"></i> -36.4</span> </div>
<div class="profile-rapid profile-game "> <p>1874</p><p>RAPID</p> </div>
<div class="profile-blitz profile-game "> <p></p><p>BLITZ</p> </div>
<!--profile-games--> </div>`;

// Tristán Delord: variación en DOS modalidades a la vez.
const DOS_VARIACIONES = `
<div class="profile-games "> <div class="profile-standart profile-game ">
<p>1870</p><p>STANDARD</p>
<span class="profile-top-rating-dataDesc">Expected<br><i class="fa fa-angle-up color_grn"></i> 46.4</span> </div>
<div class="profile-rapid profile-game "> <p>1550</p><p>RAPID</p>
<span class="profile-top-rating-dataDesc">Expected<br><i class="fa fa-angle-up color_grn"></i> 45.60</span> </div>
<div class="profile-blitz profile-game "> <p>1797</p><p>BLITZ</p> </div>
<!--profile-games--> </div>`;

describe("parsearPerfilFide", () => {
  it("lee las tres modalidades", () => {
    const p = parsearPerfilFide(CON_SUBIDA);
    expect(p.clasicas.elo).toBe(1948);
    expect(p.rapidas.elo).toBe(1864);
    expect(p.blitz.elo).toBe(1759);
  });

  it("lee la subida pendiente de la próxima publicación", () => {
    expect(parsearPerfilFide(CON_SUBIDA).clasicas.variacion).toBe(5);
  });

  it("una bajada sale NEGATIVA, con sus decimales", () => {
    // Redondear a entero convertiría un "+0,4" en "sin cambios", que es lo contrario
    // de lo que dice el perfil.
    expect(parsearPerfilFide(CON_BAJADA).clasicas.variacion).toBeCloseTo(-36.4, 5);
  });

  it("no confunde las modalidades entre ellas", () => {
    // El fallo evidente de un parser así: coger el `span` de la modalidad de al lado.
    const p = parsearPerfilFide(CON_SUBIDA);
    expect(p.rapidas.variacion).toBeNull();
    expect(p.blitz.variacion).toBeNull();
  });

  it("aguanta variación en dos modalidades a la vez", () => {
    const p = parsearPerfilFide(DOS_VARIACIONES);
    expect(p.clasicas.variacion).toBeCloseTo(46.4, 5);
    expect(p.rapidas.variacion).toBeCloseTo(45.6, 5);
    expect(p.blitz.variacion).toBeNull();
  });

  it("sin rating en una modalidad devuelve null, no cero", () => {
    // Cero sería "tiene 0 de ELO"; null es "no tiene rating de eso".
    expect(parsearPerfilFide(CON_BAJADA).blitz.elo).toBeNull();
  });

  it("un HTML que no es un perfil no revienta ni inventa números", () => {
    const p = parsearPerfilFide("<html><body>Página de error</body></html>");
    expect(p.clasicas).toEqual({ elo: null, variacion: null });
    expect(p.rapidas.elo).toBeNull();
  });
});

describe("textoVariacion", () => {
  it("pone el signo y la coma decimal española", () => {
    expect(textoVariacion(5)).toBe("+5,0");
    expect(textoVariacion(-36.4)).toBe("−36,4");
  });

  it("no dice nada cuando no hay nada que decir", () => {
    // null = no ha jugado; 0 = ha jugado y está igual. En pantalla los dos sobran.
    expect(textoVariacion(null)).toBeNull();
    expect(textoVariacion(0)).toBeNull();
  });
});
