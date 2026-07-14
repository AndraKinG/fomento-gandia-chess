import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { offsetMadrid, parseCalendarioFACV } from "./facv-calendario";

const html = readFileSync(join(__dirname, "fixtures", "facv-calendario.html"), "utf-8");

// Valores reales anotados del fixture (descargado 2026-07-14 de
// calendario_publico.php?id=1428&modo=completo&sede_id=0&club_id=0&r=0,
// recortado a los 3 grupos que contienen "Fomento de Gandía"):
// - Ronda 1, grupo "1º Autonómica Sur" (equipo A): Sueca (local) - Fomento de
//   Gandía (visitante), 10/01/2026 17:00.
// - Ronda 2, grupo "1º Autonómica Sur" (equipo A): Fomento de Gandía (local) -
//   Raspeig (visitante), 17/01/2026 17:00.
// - Ronda 1, grupo "1º Prov. Valencia Sur" (equipo B): Xeraco C (local) -
//   Fomento de Gandía B (visitante), 10/01/2026 17:00.
// - Ronda 1, grupo "2º Prov. 8T. Valencia Sur 1" (equipo C): Fomento de
//   Gandía C (local) - Beniganim B (visitante), 10/01/2026 17:00.
// El equipo A juega 11 rondas, B 11 rondas, C solo 9 (grupo más pequeño):
// 31 encuentros de "Fomento" en total en el fixture.
const TOTAL_ESPERADO = 31;

describe("parseCalendarioFACV", () => {
  it("extrae todos los encuentros del club (A + B + C)", () => {
    const jornadas = parseCalendarioFACV(html, "Fomento de Gandia");
    expect(jornadas.length).toBe(TOTAL_ESPERADO);
  });

  it("extrae el primer encuentro real del equipo A (ronda 1, local Sueca)", () => {
    const jornadas = parseCalendarioFACV(html, "Fomento de Gandia");
    const fila = jornadas.find((j) => j.ronda === 1 && j.grupo === "1º Autonómica Sur");
    expect(fila).toEqual({
      grupo: "1º Autonómica Sur",
      ronda: 1,
      fecha: "2026-01-10T17:00:00",
      local: "Sueca",
      visitante: "Fomento de Gandía",
    });
  });

  it("extrae el segundo encuentro real del equipo A (ronda 2, visitante Raspeig)", () => {
    const jornadas = parseCalendarioFACV(html, "Fomento de Gandia");
    const fila = jornadas.find((j) => j.ronda === 2 && j.grupo === "1º Autonómica Sur");
    expect(fila).toEqual({
      grupo: "1º Autonómica Sur",
      ronda: 2,
      fecha: "2026-01-17T17:00:00",
      local: "Fomento de Gandía",
      visitante: "Raspeig",
    });
  });

  it("extrae el encuentro real del equipo B (ronda 1, visitante Fomento de Gandía B)", () => {
    const jornadas = parseCalendarioFACV(html, "Fomento de Gandia");
    const fila = jornadas.find((j) => j.grupo === "1º Prov. Valencia Sur");
    expect(fila).toEqual({
      grupo: "1º Prov. Valencia Sur",
      ronda: 1,
      fecha: "2026-01-10T17:00:00",
      local: "Xeraco C",
      visitante: "Fomento de Gandía B",
    });
  });

  it("extrae el encuentro real del equipo C (ronda 1, local Fomento de Gandía C)", () => {
    const jornadas = parseCalendarioFACV(html, "Fomento de Gandia");
    const fila = jornadas.find((j) => j.grupo === "2º Prov. 8T. Valencia Sur 1");
    expect(fila).toEqual({
      grupo: "2º Prov. 8T. Valencia Sur 1",
      ronda: 1,
      fecha: "2026-01-10T17:00:00",
      local: "Fomento de Gandía C",
      visitante: "Beniganim B",
    });
  });

  it("el equipo C solo tiene 9 rondas (grupo con menos equipos)", () => {
    const jornadas = parseCalendarioFACV(html, "Fomento de Gandia");
    const deC = jornadas.filter((j) => j.grupo === "2º Prov. 8T. Valencia Sur 1");
    expect(deC.length).toBe(9);
  });

  it("la comparación de nombre de club ignora mayúsculas y acentos", () => {
    const conAcento = parseCalendarioFACV(html, "Fomento de Gandía");
    const sinAcentoMayus = parseCalendarioFACV(html, "FOMENTO DE GANDIA");
    expect(conAcento.length).toBe(TOTAL_ESPERADO);
    expect(sinAcentoMayus.length).toBe(TOTAL_ESPERADO);
  });

  it("devuelve [] con HTML vacío", () => {
    expect(parseCalendarioFACV("", "Fomento de Gandia")).toEqual([]);
  });

  it("devuelve [] con HTML sin encuentros del club", () => {
    expect(parseCalendarioFACV("<html><body>nada</body></html>", "Fomento de Gandia")).toEqual([]);
  });

  it("decodifica entidades HTML de comillas y apóstrofes en los nombres", () => {
    const syntheticHtml = `
      <div class="grupo-title">Grupo test</div>
      <div class="col-12 col-md-6 col-xl-4" id="g1_r3">
        <h5><span>Ronda 3 <span class='badge'>05/03/2026</span> <span class='badge'>🕒 16:30</span></span></h5>
        <table><tbody>
          <tr>
            <td><span class='team-wrap'><span class='team-name'>L&#039;Agricultura Club</span></span></td>
            <td><span class='fw-bold'>-</span></td>
            <td><span class='team-wrap'><span class='team-name'>Fomento de Gandía</span></span></td>
          </tr>
        </tbody></table>
      </div>
    `;
    const jornadas = parseCalendarioFACV(syntheticHtml, "Fomento de Gandia");
    expect(jornadas).toEqual([
      {
        grupo: "Grupo test",
        ronda: 3,
        fecha: "2026-03-05T16:30:00",
        local: "L'Agricultura Club",
        visitante: "Fomento de Gandía",
      },
    ]);
  });

  it("devuelve fecha null cuando no hay badge de fecha en la ronda", () => {
    const syntheticHtml = `
      <div class="grupo-title">Grupo test</div>
      <div class="col-12 col-md-6 col-xl-4" id="g1_r5">
        <h5><span>Ronda 5 (por determinar)</span></h5>
        <table><tbody>
          <tr>
            <td><span class='team-wrap'><span class='team-name'>Rival X</span></span></td>
            <td><span class='fw-bold'>-</span></td>
            <td><span class='team-wrap'><span class='team-name'>Fomento de Gandía</span></span></td>
          </tr>
        </tbody></table>
      </div>
    `;
    const jornadas = parseCalendarioFACV(syntheticHtml, "Fomento de Gandia");
    expect(jornadas).toEqual([
      {
        grupo: "Grupo test",
        ronda: 5,
        fecha: null,
        local: "Rival X",
        visitante: "Fomento de Gandía",
      },
    ]);
  });
});

describe("offsetMadrid", () => {
  it("horario de invierno (enero)", () => {
    expect(offsetMadrid("2026-01-10T17:00:00")).toBe("+01:00");
  });

  it("horario de verano (abril)", () => {
    expect(offsetMadrid("2026-04-15T17:00:00")).toBe("+02:00");
  });

  it("frontera de marzo: el último domingo (29) ya es verano", () => {
    expect(offsetMadrid("2026-03-29T12:00:00")).toBe("+02:00");
  });

  it("frontera de marzo: el día anterior (28) todavía es invierno", () => {
    expect(offsetMadrid("2026-03-28T12:00:00")).toBe("+01:00");
  });

  it("frontera de octubre: el último domingo (25) ya es invierno", () => {
    expect(offsetMadrid("2026-10-25T12:00:00")).toBe("+01:00");
  });

  it("frontera de octubre: el día anterior (24) todavía es verano", () => {
    expect(offsetMadrid("2026-10-24T12:00:00")).toBe("+02:00");
  });
});
