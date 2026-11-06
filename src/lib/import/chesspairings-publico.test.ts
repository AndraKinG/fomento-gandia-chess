import { describe, expect, it } from "vitest";
import {
  columna,
  parsearCabeceraPublica,
  parsearClasificacionPublica,
  parsearEmparejamientosPublicos,
  parsearInscritosPublicos,
  parsearRondaMostrada,
  texto,
  urlPestana,
} from "./chesspairings-publico";

/**
 * HTML REAL de la página pública de un torneo de ChessPairings (el 2292, de OTRA cuenta,
 * leído el 2026-08-26 pidiendo `lang=en`). Recortado a tres filas por tabla, pero sin tocar
 * su marcado: es un parser de página ajena y la gracia del test es enterarse el día que
 * la rediseñen.
 *
 * SE ELIGIÓ UN TORNEO DE OTRA CUENTA a propósito: es justo lo que la API NO puede leer y
 * el motivo de que este módulo exista.
 */
const TITULO = "<title>Standings - Heydar Aliyev 103rd Anniversary Chess Memorial Tournament - ChessPairings</title>";
const CLASIFICACION = "<table><tr> <th class=\"text-center\" style=\"width:45px\">Rank</th> <th>Player</th> <th>Fed</th> <th class=\"text-center\">Year</th> <th class=\"text-center\">S</th> <th class=\"text-center\">Rating</th> <th class=\"text-center\">Points</th> <th class=\"text-center pub-tb\" title=\"Direct Encounter\"> DE </th> <th class=\"text-center pub-tb\" title=\"Number of Wins\"> Win </th> <th class=\"text-center pub-tb\" title=\"Buchholz Cut 1\"> Buc1 </th> <th class=\"text-center pub-tb\" title=\"Buchholz Total\"> BucT </th> <th class=\"text-center pub-tb\" title=\"Sonneborn-Berger\"> SB </th> </tr><tr> <td class=\"pub-pos pub-pos-1\">1</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31740\" class=\"pub-player-link\" title=\"View player card\"> Aghayev, Nariman </a> </td> <td>AZE</td> <td class=\"text-center\">2005</td> <td class=\"text-center\">M</td> <td class=\"text-center\">-</td> <td class=\"text-center pub-points\">5.0</td> <td class=\"pub-tb\"> 0 </td> <td class=\"pub-tb\"> 5 </td> <td class=\"pub-tb\"> 11.5 </td> <td class=\"pub-tb\"> 13.5 </td> <td class=\"pub-tb\"> 13.5 </td> </tr><tr> <td class=\"pub-pos pub-pos-2\">2</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31991\" class=\"pub-player-link\" title=\"View player card\"> Akimov, Sarvar </a> </td> <td>UZB</td> <td class=\"text-center\">2003</td> <td class=\"text-center\">M</td> <td class=\"text-center\">-</td> <td class=\"text-center pub-points\">4.0</td> <td class=\"pub-tb\"> 0 </td> <td class=\"pub-tb\"> 4 </td> <td class=\"pub-tb\"> 11.5 </td> <td class=\"pub-tb\"> 12.5 </td> <td class=\"pub-tb\"> 9.5 </td> </tr><tr> <td class=\"pub-pos pub-pos-3\">3</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=28598\" class=\"pub-player-link\" title=\"View player card\"> Ahmadov, Nasib </a> </td> <td>AZE</td> <td class=\"text-center\">2005</td> <td class=\"text-center\">M</td> <td class=\"text-center\">-</td> <td class=\"text-center pub-points\">4.0</td> <td class=\"pub-tb\"> 0 </td> <td class=\"pub-tb\"> 4 </td> <td class=\"pub-tb\"> 10 </td> <td class=\"pub-tb\"> 11 </td> <td class=\"pub-tb\"> 8 </td> </tr></table>";
const EMPAREJAMIENTOS = "<table><tr> <th class=\"text-center\" style=\"width:50px\">Bd</th> <th style=\"text-align:right\">White</th> <th class=\"text-center\" style=\"width:50px\">Pts</th> <th class=\"text-center\" style=\"width:70px\">Result</th> <th class=\"text-center\" style=\"width:50px\">Pts</th> <th>Black</th> </tr><tr> <td class=\"text-center\" style=\"font-weight:700;color:var(--color-text-light)\">1</td> <td style=\"text-align:right\"> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=28599\" class=\"pub-player-link\"> Khalilzada, Amin <small style=\"color:var(--color-text-light)\">(0)</small> </a> </td> <td class=\"text-center\" style=\"color:var(--color-text-light);font-size:0.82rem\">3.0</td> <td class=\"text-center\" style=\"font-weight:800\">0-1</td> <td class=\"text-center\" style=\"color:var(--color-text-light);font-size:0.82rem\">4.0</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31740\" class=\"pub-player-link\"> Aghayev, Nariman <small style=\"color:var(--color-text-light)\">(0)</small> </a> </td> </tr><tr> <td class=\"text-center\" style=\"font-weight:700;color:var(--color-text-light)\">2</td> <td style=\"text-align:right\"> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=32014\" class=\"pub-player-link\"> Tagaev, Rashid <small style=\"color:var(--color-text-light)\">(0)</small> </a> </td> <td class=\"text-center\" style=\"color:var(--color-text-light);font-size:0.82rem\">3.0</td> <td class=\"text-center\" style=\"font-weight:800\">0-1</td> <td class=\"text-center\" style=\"color:var(--color-text-light);font-size:0.82rem\">3.0</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31991\" class=\"pub-player-link\"> Akimov, Sarvar <small style=\"color:var(--color-text-light)\">(0)</small> </a> </td> </tr><tr> <td class=\"text-center\" style=\"font-weight:700;color:var(--color-text-light)\">3</td> <td style=\"text-align:right\"> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31739\" class=\"pub-player-link\"> Dashdamirli, Zarifa <small style=\"color:var(--color-text-light)\">(0)</small> </a> </td> <td class=\"text-center\" style=\"color:var(--color-text-light);font-size:0.82rem\">2.0</td> <td class=\"text-center\" style=\"font-weight:800\">0-1</td> <td class=\"text-center\" style=\"color:var(--color-text-light);font-size:0.82rem\">3.0</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=28598\" class=\"pub-player-link\"> Ahmadov, Nasib <small style=\"color:var(--color-text-light)\">(0)</small> </a> </td> </tr></table>";
const INSCRITOS = "<table><tr> <th class=\"text-center\" style=\"width:45px\">No.</th> <th class=\"pub-sortable\" onclick=\"ordinaPerNome()\" title=\"Click to sort\">Player <span id=\"sortArrowNome\"></span></th> <th>FIDE ID</th> <th>Fed</th> <th class=\"text-center pub-sortable\" onclick=\"ordinaPerAnno()\" title=\"Click to sort\">Year <span id=\"sortArrowAnno\"></span></th> <th class=\"text-center pub-sortable\" onclick=\"ordinaPerRating()\" title=\"Click to sort\">Rating <span id=\"sortArrow\"></span></th> <th class=\"text-center\">Points</th> </tr><tr data-nome=\"abbasli ozlam\" data-fed=\"aze\" data-rating=\"0\" data-anno=\"2005\" data-pos=\"1\"> <td class=\"text-center\" style=\"font-weight:600;color:var(--color-text-light)\">1</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31741\" class=\"pub-player-link\"> Abbasli, Ozlam </a> </td> <td>-</td> <td>AZE</td> <td class=\"text-center\">2005</td> <td class=\"text-center\">-</td> <td class=\"text-center pub-points\">1.0</td> </tr><tr data-nome=\"aghayev nariman\" data-fed=\"aze\" data-rating=\"0\" data-anno=\"2005\" data-pos=\"2\"> <td class=\"text-center\" style=\"font-weight:600;color:var(--color-text-light)\">2</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=31740\" class=\"pub-player-link\"> Aghayev, Nariman </a> </td> <td>-</td> <td>AZE</td> <td class=\"text-center\">2005</td> <td class=\"text-center\">-</td> <td class=\"text-center pub-points\">5.0</td> </tr><tr data-nome=\"aghayeva sakina\" data-fed=\"aze\" data-rating=\"0\" data-anno=\"2005\" data-pos=\"3\"> <td class=\"text-center\" style=\"font-weight:600;color:var(--color-text-light)\">3</td> <td> <a href=\"giocatore.php?id=2292&token=d369643e2c6175c024d0edb0945bd1712a008670526bb5f57b7b6f6e41fdd86e&id_giocatore=29248\" class=\"pub-player-link\"> Aghayeva, Sakina </a> </td> <td>-</td> <td>AZE</td> <td class=\"text-center\">2005</td> <td class=\"text-center\">-</td> <td class=\"text-center pub-points\">1.0</td> </tr></table>";

describe("urlPestana", () => {
  it("añade la pestaña y FIJA EL IDIOMA", () => {
    // Las cabeceras de sus tablas cambian con el idioma —Points/Puntos/Punti— y también
    // con el Accept-Language del navegador. Sin fijarlo, el parser dependería de cómo
    // tenga configurada la cuenta quien organice el torneo.
    const u = urlPestana("https://my.chesspairings.org/pubblico/torneo.php?id=1&token=x", "classifica");
    expect(u).toContain("tab=classifica");
    expect(u).toContain("lang=en");
  });

  it("no arrastra el ancla de la URL", () => {
    expect(urlPestana("https://x/y?id=1#abajo", "iscritti")).not.toContain("#");
  });

  it("pide una ronda concreta con `turno`, como sus botones Previous/Next", () => {
    const u = urlPestana("https://my.chesspairings.org/pubblico/torneo.php?id=1&token=x", "abbinamenti", 2);
    expect(u).toContain("tab=abbinamenti&turno=2");
    expect(u).toContain("lang=en");
  });

  it("sin ronda, o con una que no es un número válido, no añade `turno`", () => {
    for (const turno of [undefined, 0, -1, 1.5, Number.NaN]) {
      expect(urlPestana("https://x/y?id=1", "abbinamenti", turno)).not.toContain("turno");
    }
  });
});

/**
 * HTML REAL del Social Fomento 2026 (ChessPairings, torneo 7001), leído el 2026-11-06 con
 * tres rondas jugadas y pidiendo `turno=1`. La cabecera de ARRIBA es la del torneo y dice la
 * ronda en curso; la de la TARJETA dice la ronda que se está enseñando.
 */
const CABECERA_TORNEO = '<path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Round 3 of 6 </span> <span class="pub-badge pub-badge-in_corso"> In progress';
const TARJETA_RONDA_1 = '<div class="pub-card-header"> <span>Round 1 of 6</span> <div class="pub-round-nav"> <a href="?id=7001&token=x&tab=abbinamenti&turno=2" class="pub-round-btn">Next &raquo;</a> </div> </div>';

describe("parsearRondaMostrada", () => {
  it("lee la ronda de la tarjeta, no la del torneo", () => {
    expect(parsearRondaMostrada(CABECERA_TORNEO + TARJETA_RONDA_1)).toBe(1);
  });

  it("y la del torneo sigue diciendo la ronda en curso", () => {
    expect(parsearCabeceraPublica(CABECERA_TORNEO + TARJETA_RONDA_1).ronda).toBe(3);
  });

  it("sin tarjeta de ronda (torneo sin emparejar), null", () => {
    expect(parsearRondaMostrada(CABECERA_TORNEO)).toBeNull();
  });
});

describe("columna", () => {
  it("busca por NOMBRE y no por posición", () => {
    // El orden cambia de un torneo a otro segun los desempates que elija el arbitro:
    // leyendo por posición, un torneo con otros desempates enseñaría el Buchholz en la
    // columna del Sonneborn.
    const cab = ["Rank", "Player", "Points", "DE", "Win", "Buc1", "BucT", "SB"];
    expect(columna(cab, "Buc1")).toBe(5);
    expect(columna(cab, "SB")).toBe(7);
  });

  it("ignora mayúsculas y puntos", () => {
    expect(columna(["No.", "Player"], "no")).toBe(0);
    expect(columna(["FIDE ID"], "fide id")).toBe(0);
  });

  it("una columna que no existe da -1, y eso es información", () => {
    // Un torneo sin Sonneborn no tiene columna SB: no es un error.
    expect(columna(["Rank", "Player"], "SB")).toBe(-1);
  });
});

describe("texto", () => {
  it("quita etiquetas y entidades", () => {
    expect(texto('<td>  Hola <span>&amp;</span> adi&#243;s </td>')).toBe("Hola & adiós");
  });
});

describe("parsearClasificacionPublica", () => {
  const filas = parsearClasificacionPublica(CLASIFICACION);

  it("lee las filas con su posición y sus puntos", () => {
    expect(filas.length).toBe(3);
    expect(filas[0].posicion).toBe(1);
    expect(filas[0].nombre).toBe("Aghayev, Nariman");
    expect(filas[0].puntos).toBe(5);
  });

  it("lee los tres desempates por su nombre de columna", () => {
    expect(filas[0].buc1).toBe(11.5);
    expect(filas[0].buct).toBe(13.5);
    expect(filas[0].sb).toBe(13.5);
  });

  it("saca el id de jugador del enlace, que es el que cruza las pestañas", () => {
    expect(filas[0].idJugador).toBe(31740);
  });

  it("un rating vacío es null y no un cero", () => {
    // Su tabla pone "-" cuando no hay rating; un 0 se leería como jugador de ELO cero.
    expect(filas[0].rating).toBeNull();
  });

  it("un HTML que no es su tabla no da filas ni revienta", () => {
    expect(parsearClasificacionPublica("<html>error</html>")).toEqual([]);
  });
});

describe("parsearEmparejamientosPublicos", () => {
  const mesas = parsearEmparejamientosPublicos(EMPAREJAMIENTOS);

  it("lee mesa, los dos jugadores y el resultado", () => {
    expect(mesas.length).toBe(3);
    expect(mesas[0].mesa).toBe(1);
    expect(mesas[0].blancas?.nombre).toBe("Khalilzada, Amin");
    expect(mesas[0].negras?.nombre).toBe("Aghayev, Nariman");
    // "0-1" desde las blancas es un 0.
    expect(mesas[0].resultado).toBe("0");
  });

  it("cada lado lleva SU id, no el mismo dos veces", () => {
    expect(mesas[0].blancas?.idJugador).toBe(28599);
    expect(mesas[0].negras?.idJugador).toBe(31740);
  });

  it("quita el (0) que pegan detrás del nombre", () => {
    expect(mesas[0].blancas?.nombre).not.toContain("(");
  });

  it("una fila con un solo jugador es un bye, no una partida", () => {
    const bye = parsearEmparejamientosPublicos(
      '<table><tr><th>Bd</th><th>White</th><th>Result</th><th>Black</th></tr>' +
      '<tr><td>3</td><td>Solo, Uno</td><td>+--</td><td></td></tr></table>'
    );
    expect(bye[0].esBye).toBe(true);
    expect(bye[0].resultado).toBeNull();
    expect(bye[0].negras).toBeNull();
  });

  it("el BYE de verdad de su página: «BYE» en negras y «+-» de resultado", () => {
    // Fila REAL de la ronda 1 del Social Fomento 2026 (2026-11-06), con el token cambiado.
    // Leída como partida salía "Juanvi — Juanvi": "BYE" se tomaba por el nombre de las
    // negras y heredaban el id de las blancas.
    const fila =
      '<tr> <td class="text-center" style="font-weight:700;color:var(--color-text-light)">9</td> <td style="text-align:right"> <a href="giocatore.php?id=7001&token=x&id_giocatore=105984" class="pub-player-link"> Sanfélix Domínguez Dominguez, Juan Vicente <small style="color:var(--color-text-light)">(1736)</small> </a> </td> <td class="text-center" style="color:var(--color-text-light);font-size:0.82rem">0.0</td> <td class="text-center" style="font-weight:800">+-</td> <td class="text-center" style="color:var(--color-text-light);font-size:0.82rem"></td> <td> <em style="color:var(--color-text-light)">BYE</em> </td> </tr>';
    const [m] = parsearEmparejamientosPublicos(EMPAREJAMIENTOS.replace("</table>", fila + "</table>")).slice(-1);
    expect(m.mesa).toBe(9);
    expect(m.esBye).toBe(true);
    expect(m.negras).toBeNull();
    expect(m.blancas?.idJugador).toBe(105984);
  });

  it("las negras nunca heredan el id de las blancas", () => {
    const [m] = parsearEmparejamientosPublicos(
      '<table><tr><th>Bd</th><th>White</th><th>Result</th><th>Black</th></tr>' +
      '<tr><td>1</td><td><a href="giocatore.php?id_giocatore=5">Uno, Blancas</a></td><td>1-0</td><td>Dos, Negras</td></tr></table>'
    );
    expect(m.blancas?.idJugador).toBe(5);
    expect(m.negras?.idJugador).toBeNull();
  });
});

describe("parsearInscritosPublicos", () => {
  const ins = parsearInscritosPublicos(INSCRITOS);

  it("lee los inscritos con su id", () => {
    expect(ins.length).toBe(3);
    expect(ins[0].nombre).toBe("Abbasli, Ozlam");
    expect(ins[0].idJugador).toBe(31741);
  });

  it("un FIDE ID sin valor es null", () => {
    // Guardarlo como texto cruzaría a todos los que no lo tienen entre ellos.
    expect(ins[0].fideId).toBeNull();
  });

  it("un FIDE ID de verdad se lee tal cual", () => {
    const con = parsearInscritosPublicos(
      '<table><tr><th>No.</th><th>Player</th><th>FIDE ID</th></tr>' +
      '<tr><td>1</td><td>Ribes, Joan</td><td>24175439</td></tr></table>'
    );
    expect(con[0].fideId).toBe("24175439");
  });
});

describe("parsearCabeceraPublica", () => {
  it("saca el nombre del torneo del título y en qué ronda va", () => {
    const c = parsearCabeceraPublica(TITULO + ' <div>Round 5 of 5</div>');
    expect(c.nombre).toBe("Heydar Aliyev 103rd Anniversary Chess Memorial Tournament");
    expect(c.ronda).toBe(5);
    expect(c.rondasTotales).toBe(5);
  });

  it("sin ronda en la página, queda a null", () => {
    expect(parsearCabeceraPublica("<title>x - y - z</title>").ronda).toBeNull();
  });
});
