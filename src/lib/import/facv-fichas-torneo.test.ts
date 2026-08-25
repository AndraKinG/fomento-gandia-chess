import { describe, expect, it } from "vitest";
import {
  claveDeFicha,
  claveDeTorneo,
  cuantasPaginas,
  parsearFichasTorneo,
  urlWidget,
} from "./facv-fichas-torneo";

/**
 * HTML REAL del widget que embute la portada de la FACV (leído el 2026-08-16). Tres
 * tarjetas a propósito: una con página y retransmisión, otra con página y resultados, y
 * una SIN enlace ninguno — que es un tercio de las que publican.
 */
const WIDGET = `
<div class="table-responsive"><table class="table table-borderless tabla-calendario"><tbody>
<tr class="p0 Clasico">
<td class="td-fecha"><div class="cal-box"><div class="cal-month">AGO</div><div class="cal-day">17<span class="cal-range">–25</span></div><div class="cal-week">Lun</div></div></td>
<td class="td-card"><div class="card-torneo card-torneo--en-juego card--nobadges"><div class="card-badges"></div><div class="card-title card-title-link">
<a href="https://www.facv.org/convocado-el-campeonato-de-espana-individual-absoluto-y-femenino-2026" target="_parent"> C. E. Individual Absoluto </a>
</div><div class="card-sub"><span class="nombrelugar">(Andalucía) </span></div><div class="card-footer-ui"><div class="card-status-row"><div class="card-status">
<a class="estado-chip" href="https://info64.org/campeonato-de-espana-individual-absoluto-y-femenino-2026" target="_parent" title="Seguir el torneo"><span class="en-juego">En juego</span></a>
</div><div class="card-live"><a class="icon-btn" href="https://sichess.com/torneos/feda26/absolut/" target="_parent" title="Retransmisión"><img src="x"></a></div></div></div></div></td>
</tr>
<tr class="p2 Clasico co">
<td class="td-fecha"><div class="cal-box"><div class="cal-month">SEP</div><div class="cal-day">11<span class="cal-range">–30</span></div><div class="cal-week">Vie</div></div></td>
<td class="td-card"><div class="card-torneo" data-label="Oficial"><div class="card-badges"></div><div class="card-title card-title-link">
<a href="https://www.facv.org/xii-torneo-de-ajedrez-ciutat-de-burjassot-sub-2400" target="_parent"> Ciutat de Burjassot </a>
</div><div class="card-sub"><span class="nombrelugar">(Burjassot) </span></div></div></td>
</tr>
<tr class="p2 Blitz">
<td class="td-fecha"><div class="cal-box"><div class="cal-month">SEP</div><div class="cal-day">6</div><div class="cal-week">Dom</div></div></td>
<td class="td-card"><div class="card-torneo"><div class="card-badges"></div><div class="card-title"> Open Fiestas de Alacuas </div>
<div class="card-sub"><span class="nombrelugar">(Alaquàs) </span></div></div></td>
</tr>
</tbody></table></div>
<nav><ul><li class="page-item"><a class="page-link" href="/appwebfacv/public/staff/torneos/list_calendario.php?lang=es&page=2">2</a></li>
<li class="page-item"><a class="page-link" href="/appwebfacv/public/staff/torneos/list_calendario.php?lang=es&page=5">5</a></li></ul></nav>`;

describe("parsearFichasTorneo", () => {
  const fichas = parsearFichasTorneo(WIDGET);

  it("lee las tres tarjetas", () => {
    expect(fichas).toHaveLength(3);
  });

  it("saca el enlace a la página de la FACV con las bases", () => {
    // Es el que pidió el propietario, con este torneo de ejemplo.
    const burjassot = fichas.find((f) => f.nombre === "Ciutat de Burjassot");
    expect(burjassot?.urlFacv).toBe(
      "https://www.facv.org/xii-torneo-de-ajedrez-ciutat-de-burjassot-sub-2400"
    );
  });

  it("coge el enlace del TÍTULO y no el primero de la fila", () => {
    // La tarjeta lleva hasta tres enlaces (bases, resultados, retransmisión): "el
    // primer <a>" traería el que no es en cuanto cambie el orden del HTML.
    const primera = fichas[0];
    expect(primera.urlFacv).toContain("/convocado-el-campeonato-de-espana");
    expect(primera.urlResultados).toBe(
      "https://info64.org/campeonato-de-espana-individual-absoluto-y-femenino-2026"
    );
  });

  it("una tarjeta SIN página se lee igual, con el enlace a null", () => {
    // Un tercio de las tarjetas no tiene página publicada; si estas se descartaran,
    // el sincronizador no podría distinguir "no la tiene" de "no la he visto".
    const alacuas = fichas.find((f) => f.nombre === "Open Fiestas de Alacuas");
    expect(alacuas).toBeDefined();
    expect(alacuas?.urlFacv).toBeNull();
    expect(alacuas?.urlResultados).toBeNull();
  });

  it("lee el día y el mes de la cajita del calendario", () => {
    const burjassot = fichas.find((f) => f.nombre === "Ciutat de Burjassot");
    expect(burjassot?.dia).toBe(11);
    expect(burjassot?.mes).toBe(9);
  });

  it("el día es el de INICIO, no el rango", () => {
    // "11–30" es del 11 al 30: el número gordo es el que vale.
    expect(fichas.find((f) => f.mes === 8)?.dia).toBe(17);
  });

  it("limpia los paréntesis del sitio", () => {
    expect(fichas.find((f) => f.nombre === "Ciutat de Burjassot")?.lugar).toBe("Burjassot");
  });

  it("un HTML que no es el widget no da tarjetas ni revienta", () => {
    expect(parsearFichasTorneo("<html><body>error</body></html>")).toEqual([]);
  });
});

describe("cuantasPaginas", () => {
  it("lee el total de la propia paginación del widget", () => {
    expect(cuantasPaginas(WIDGET)).toBe(5);
  });

  it("sin paginación, una sola página", () => {
    expect(cuantasPaginas("<div>nada</div>")).toBe(1);
  });
});

describe("urlWidget", () => {
  it("la primera página va sin parámetro", () => {
    expect(urlWidget(1)).not.toContain("page=");
    expect(urlWidget(3)).toContain("page=3");
  });
});

describe("las claves con las que se casan las dos fuentes", () => {
  it("la tarjeta y nuestro torneo dan la MISMA clave", () => {
    // Es todo el mecanismo: la tarjeta no trae el año y nuestra fila sí, así que la
    // clave se queda en nombre + día + mes.
    expect(claveDeTorneo("Ciutat de Burjassot", "2026-09-11")).toBe(
      claveDeFicha("Ciutat de Burjassot", 11, 9)
    );
  });

  it("no distingue mayúsculas ni acentos", () => {
    // La FACV escribe "S2400 OROPESA DEL MAR" en un sitio y "S2400 Oropesa del Mar"
    // en otro; son el mismo torneo.
    expect(claveDeFicha("S2400 OROPESA DEL MAR", 4, 9)).toBe(
      claveDeFicha("S2400 Oropesa del Mar", 4, 9)
    );
  });

  it("dos torneos con el mismo nombre en fechas distintas NO se confunden", () => {
    // Pasa de verdad: "Curso Árbitros" sale el 5 y el 12 de septiembre.
    expect(claveDeFicha("Curso Árbitros", 5, 9)).not.toBe(claveDeFicha("Curso Árbitros", 12, 9));
  });

  it("una fecha que no es una fecha no inventa clave", () => {
    expect(claveDeTorneo("Open", "sin fecha")).toBeNull();
  });
});
