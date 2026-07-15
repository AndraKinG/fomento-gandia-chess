import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseClasificacionFACV,
  parseEnlacesClasificacionFACV,
  parseResultadosFACV,
} from "./facv-resultados";

const htmlCalendario = readFileSync(join(__dirname, "fixtures", "facv-calendario.html"), "utf-8");
const htmlClasifA = readFileSync(join(__dirname, "fixtures", "facv-clasificacion-a.html"), "utf-8");
const htmlClasifB = readFileSync(join(__dirname, "fixtures", "facv-clasificacion-b.html"), "utf-8");
const htmlClasifC = readFileSync(join(__dirname, "fixtures", "facv-clasificacion-c.html"), "utf-8");

// Valores reales anotados del fixture `facv-calendario.html` (descargado
// 2026-07-14; re-verificado con una descarga FRESCA el 2026-07-15 —
// idéntico, la temporada 2026 ya ha terminado y sus 335 encuentros llevan
// marcador final desde entonces). Misma página que el calendario (T5-1B):
// el marcador vive en la MISMA celda `cal-col-res` entre local y visitante
// ("<span class='fw-bold'>4.5 - 3.5</span>"), "local - visitante" siempre
// (nunca reordenado por punto de vista de ningún club).
describe("parseResultadosFACV", () => {
  it("extrae los 31 encuentros del club, todos con marcador (temporada terminada)", () => {
    const filas = parseResultadosFACV(htmlCalendario, "Fomento de Gandia");
    expect(filas.length).toBe(31);
    expect(filas.every((f) => f.marcadorLocal !== null && f.marcadorVisitante !== null)).toBe(true);
  });

  it("ronda 1, equipo A: Sueca (local) 4.5 - Fomento de Gandía (visitante) 3.5", () => {
    const filas = parseResultadosFACV(htmlCalendario, "Fomento de Gandia");
    const fila = filas.find((f) => f.ronda === 1 && f.grupo === "1º Autonómica Sur");
    expect(fila).toEqual({
      grupo: "1º Autonómica Sur",
      ronda: 1,
      local: "Sueca",
      visitante: "Fomento de Gandía",
      marcadorLocal: 4.5,
      marcadorVisitante: 3.5,
    });
  });

  it("ronda 1, equipo B: Xeraco C (local) 3 - Fomento de Gandía B (visitante) 5", () => {
    const filas = parseResultadosFACV(htmlCalendario, "Fomento de Gandia");
    const fila = filas.find((f) => f.ronda === 1 && f.grupo === "1º Prov. Valencia Sur");
    expect(fila).toEqual({
      grupo: "1º Prov. Valencia Sur",
      ronda: 1,
      local: "Xeraco C",
      visitante: "Fomento de Gandía B",
      marcadorLocal: 3,
      marcadorVisitante: 5,
    });
  });

  it("ronda 1, equipo C: Fomento de Gandía C (local) 6 - Beniganim B (visitante) 2", () => {
    const filas = parseResultadosFACV(htmlCalendario, "Fomento de Gandia");
    const fila = filas.find((f) => f.grupo === "2º Prov. 8T. Valencia Sur 1" && f.ronda === 1);
    expect(fila).toEqual({
      grupo: "2º Prov. 8T. Valencia Sur 1",
      ronda: 1,
      local: "Fomento de Gandía C",
      visitante: "Beniganim B",
      marcadorLocal: 6,
      marcadorVisitante: 2,
    });
  });

  it("devuelve marcadores null cuando el encuentro aún no se ha jugado (sin badge de resultado)", () => {
    const syntheticHtml = `
      <div class="grupo-title">Grupo test</div>
      <div class="col-12 col-md-6 col-xl-4" id="g1_r9">
        <h5><span>Ronda 9 (por determinar)</span></h5>
        <table><tbody>
          <tr>
            <td><span class='team-wrap'><span class='team-name'>Rival X</span></span></td>
            <td class='cal-col-res'><span class='fw-bold'>-</span></td>
            <td><span class='team-wrap'><span class='team-name'>Fomento de Gandía</span></span></td>
          </tr>
        </tbody></table>
      </div>
    `;
    const filas = parseResultadosFACV(syntheticHtml, "Fomento de Gandia");
    expect(filas).toEqual([
      {
        grupo: "Grupo test",
        ronda: 9,
        local: "Rival X",
        visitante: "Fomento de Gandía",
        marcadorLocal: null,
        marcadorVisitante: null,
      },
    ]);
  });

  it("devuelve [] con HTML vacío", () => {
    expect(parseResultadosFACV("", "Fomento de Gandia")).toEqual([]);
  });
});

// El enlace "Clasificación" (chess-results, art=46, SIN &rd=) aparece una vez
// por grupo justo debajo del título, antes de las tarjetas de ronda (que
// llevan cada una su propio enlace &rd=N&art=46 — snapshot de esa ronda, no
// el que interesa aquí). Investigado en el fixture: los 3 grupos de nuestro
// club son torneos DISTINTOS de chess-results (tnr1326331/1326338/1326545).
describe("parseEnlacesClasificacionFACV", () => {
  it("extrae el enlace de clasificación general (sin &rd=) de los 3 grupos del club", () => {
    const enlaces = parseEnlacesClasificacionFACV(htmlCalendario, "Fomento de Gandia");
    expect(enlaces).toEqual([
      {
        grupo: "1º Autonómica Sur",
        url: "https://chess-results.com/tnr1326331.aspx?lan=2&turdet=NO&flag=30&art=46",
      },
      {
        grupo: "1º Prov. Valencia Sur",
        url: "https://chess-results.com/tnr1326338.aspx?lan=2&turdet=NO&flag=30&art=46",
      },
      {
        grupo: "2º Prov. 8T. Valencia Sur 1",
        url: "https://chess-results.com/tnr1326545.aspx?lan=2&turdet=NO&flag=30&art=46",
      },
    ]);
  });

  it("devuelve [] con HTML vacío", () => {
    expect(parseEnlacesClasificacionFACV("", "Fomento de Gandia")).toEqual([]);
  });
});

// Clasificación real de chess-results (art=46): tabla `CRs1`, columnas Rk. /
// No.Ini. / bandera / Equipo / Partidas / + / = / - / Des 1 (Des 1 =
// "Matchpoints", 2 por victoria + 1 por tablas de equipo: es el que se
// muestra como "puntos" de clasificación) / Des 2-4 (desempates, no se usan).
describe("parseClasificacionFACV", () => {
  it("grupo A: 12 equipos, Alfaz del Pi 1º con 20 puntos, Fomento de Gandía 11º con 4", () => {
    const filas = parseClasificacionFACV(htmlClasifA);
    expect(filas.length).toBe(12);
    expect(filas[0]).toEqual({ posicion: 1, club: "Alfaz del Pi", puntos: 20 });
    expect(filas.find((f) => f.club === "Fomento de Gandía")).toEqual({
      posicion: 11,
      club: "Fomento de Gandía",
      puntos: 4,
    });
  });

  it("grupo B: Fomento de Gandía B 3º con 16 puntos", () => {
    const filas = parseClasificacionFACV(htmlClasifB);
    expect(filas.find((f) => f.club === "Fomento de Gandía B")).toEqual({
      posicion: 3,
      club: "Fomento de Gandía B",
      puntos: 16,
    });
  });

  it("grupo C: Fomento de Gandía C 3º con 13 puntos, con hueco de posición (equipo retirado)", () => {
    const filas = parseClasificacionFACV(htmlClasifC);
    expect(filas.find((f) => f.club === "Fomento de Gandía C")).toEqual({
      posicion: 3,
      club: "Fomento de Gandía C",
      puntos: 13,
    });
    // El equipo retirado salta de la posición 8 a la 10 (sin 9ª posición):
    // el parser debe respetar la posición tal cual la da chess-results, no
    // renumerar.
    expect(filas.some((f) => f.posicion === 9)).toBe(false);
    expect(filas.some((f) => f.posicion === 10)).toBe(true);
  });

  it("devuelve [] con HTML vacío", () => {
    expect(parseClasificacionFACV("")).toEqual([]);
  });
});
