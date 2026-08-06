/**
 * Parser de la página "Emparejamientos por mesas" de chess-results.com (`art=3`).
 *
 * POR QUÉ EXISTE: el calendario público de la FACV solo publica el marcador global
 * de cada encuentro ("4½:3½"). El detalle tablero a tablero —quién jugó, con qué
 * color, contra quién, con qué ELO y con qué resultado— no está ahí: la FACV enlaza
 * a chess-results.com, un enlace "Alineación" por grupo. Esto lee esa página.
 *
 * UNA PÁGINA POR GRUPO, NO UNA POR RONDA. El mismo enlace sin `&rd=` trae las once
 * rondas de golpe (66 encuentros, 528 tableros, 250 KB). Con `&rd=N` habría que
 * pedir 11 páginas por grupo, 33 en total, para el mismo dato.
 *
 * EL HTML TIENE TABLAS ANIDADAS y eso es la trampa de este fichero: la celda del
 * nombre de cada jugador es en realidad una tabla dentro de la celda, para poder
 * pintar el cuadradito del color. Cualquier expresión del tipo `<tr>.*?</tr>` se
 * corta en el `</tr>` de dentro y se queda sin el resultado, que es la última
 * columna. Por eso lo primero que se hace es aplanar esas celdas.
 */

/** Un tablero del acta, tal y como lo publica chess-results. */
export type TableroChessResults = {
  /** Número de tablero dentro del encuentro, de 1 a 8. */
  tablero: number;
  localNombre: string;
  localElo: number | null;
  /** true si el jugador del equipo LOCAL llevaba blancas en este tablero. */
  localBlancas: boolean;
  visitanteNombre: string;
  visitanteElo: number | null;
  /**
   * Resultado desde el punto de vista del LOCAL. `null` si el tablero no se ha
   * jugado todavía. Una incomparecencia ("+ - -") cuenta como victoria: es lo que
   * vale para el marcador.
   */
  resultadoLocal: "1" | "0.5" | "0" | null;
  /** true si el tablero se ganó por incomparecencia y no jugando. */
  incomparecencia: boolean;
};

export type EncuentroChessResults = {
  ronda: number;
  local: string;
  visitante: string;
  /** Del marcador del encuentro, ya en número. null si aún no se ha jugado. */
  marcadorLocal: number | null;
  marcadorVisitante: number | null;
  tableros: TableroChessResults[];
};

/** URL de la página de alineaciones de todas las rondas de un grupo. */
export function urlAlineaciones(tnrId: number): string {
  return `https://chess-results.com/tnr${tnrId}.aspx?lan=2&turdet=NO&flag=30&art=3`;
}

/** Id del torneo en chess-results dentro de una URL suya. null si no lo lleva. */
export function tnrDeUrl(url: string): number | null {
  const m = /tnr(\d+)\.aspx/i.exec(url);
  return m ? Number(m[1]) : null;
}

function texto(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&frac12;/g, "½")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aplana las celdas de nombre, que llevan una tabla dentro para el cuadradito del
 * color, y deja el color como atributo de la celda. Sin esto no se puede recorrer
 * la tabla por filas.
 */
function aplanar(html: string): string {
  return html.replace(
    /<td class="CR"><table><tr><td>\s*(?:<div class="Farbe([ws])T"><\/div>)?\s*<\/td><td class="CR">([^<]*)<\/td><\/tr><\/table><\/td>/g,
    (_todo, color: string | undefined, nombre: string) =>
      `<td class="CR" data-color="${color ?? ""}">${nombre}</td>`
  );
}

/** "4½:3½" o "4 : 4" -> [4.5, 3.5] / [4, 4]. Cualquier otra cosa -> [null, null]. */
export function parseMarcadorEncuentro(bruto: string): [number | null, number | null] {
  const limpio = texto(bruto).replace(/\s/g, "");
  const m = /^(\d+(?:½)?|½)[:-](\d+(?:½)?|½)$/.exec(limpio);
  if (!m) return [null, null];
  const aNumero = (s: string): number => {
    const medio = s.includes("½");
    const entero = Number(s.replace("½", "") || "0");
    return entero + (medio ? 0.5 : 0);
  };
  return [aNumero(m[1]), aNumero(m[2])];
}

/**
 * Resultado de un tablero desde el punto de vista del local.
 *
 * Formas reales medidas sobre el acta de 2026 del grupo de 1ª Autonómica Sur (528
 * tableros): `1 - 0`, `0 - 1`, `½ - ½` y `+ - -`, que es una incomparecencia del
 * visitante. `- - +` es la simétrica.
 */
export function parseResultadoTablero(bruto: string): {
  resultadoLocal: "1" | "0.5" | "0" | null;
  incomparecencia: boolean;
} {
  const t = texto(bruto).replace(/\s/g, "");
  if (t === "1-0") return { resultadoLocal: "1", incomparecencia: false };
  if (t === "0-1") return { resultadoLocal: "0", incomparecencia: false };
  if (t === "½-½") return { resultadoLocal: "0.5", incomparecencia: false };
  if (t === "+--") return { resultadoLocal: "1", incomparecencia: true };
  if (t === "--+") return { resultadoLocal: "0", incomparecencia: true };
  // Doble incomparecencia: no puntúa para nadie.
  if (t === "---") return { resultadoLocal: null, incomparecencia: true };
  return { resultadoLocal: null, incomparecencia: false };
}

function celdas(fila: string, patron: RegExp): string[] {
  return [...fila.matchAll(patron)].map((m) => m[1]);
}

const CABECERA_RONDA = /<td class="none" colspan="\d+">\s*(\d+)\.\s*Ronda/;
const CABECERA_ENCUENTRO = /<th class="CRc">M\.<\/th>/;
const NUMERO_TABLERO = /<td class="CRc">(\d+)\.(\d+)<\/td>/;
const CELDA_TH = /<th[^>]*>([\s\S]*?)<\/th>/g;
const CELDA_TD = /<td[^>]*>([\s\S]*?)<\/td>/g;
const NOMBRE_CON_COLOR = /<td class="CR" data-color="([ws]?)">([^<]*)<\/td>/g;
const ELO = /<td class="CRr">([^<]*)<\/td>/g;

/**
 * Extrae todos los encuentros con su detalle por tablero.
 *
 * Devuelve los encuentros de TODOS los equipos del grupo, no solo los del club:
 * filtrar es cosa de quien lo llama, que es el único que sabe cómo se llama el club
 * en cada grupo.
 */
export function parseAlineacionesChessResults(html: string): EncuentroChessResults[] {
  const plano = aplanar(html);
  // Se parte por filas y CADA TROZO SE CORTA EN SU PROPIO `</tr>`. Lo segundo no es
  // adorno: la última fila de la tabla no tiene otro `<tr` detrás que la corte, así
  // que el trozo seguía hasta el final del documento y la "última celda" acababa
  // siendo un `<td>` del pie de página. Resultado: el tablero 8 del último encuentro
  // de cada página se quedaba sin resultado, en silencio.
  //
  // Después de aplanar ya no hay `<tr>` anidados, así que el primer `</tr>` es el de
  // la fila.
  const filas = plano
    .split(/<tr\b/i)
    .slice(1)
    .map((f) => f.split(/<\/tr>/i)[0]);

  const encuentros: EncuentroChessResults[] = [];
  let ronda = 0;
  let actual: EncuentroChessResults | null = null;

  for (const fila of filas) {
    const cabeceraRonda = CABECERA_RONDA.exec(fila);
    if (cabeceraRonda) {
      ronda = Number(cabeceraRonda[1]);
      continue;
    }

    if (CABECERA_ENCUENTRO.test(fila)) {
      // Celdas: "M." | nº | LOCAL | "Elo" | "-" | nº | VISITANTE | "Elo" | marcador
      //
      // OJO CON LOS NÚMEROS: son la posición de cada equipo en el grupo, NO el
      // número del encuentro. Se comprobó con la ronda 11, donde el encuentro
      // "M. 11 Alfaz del Pi - 1 Capablanca" lleva los tableros numerados 6.1 a 6.8.
      // Por eso el número de tablero se saca de la propia fila del tablero y los
      // encuentros se identifican por los nombres de los equipos.
      const th = celdas(fila, CELDA_TH).map(texto);
      const equipos = th.filter(
        (c, i) => i > 0 && c !== "Elo" && c !== "-" && c !== "" && !/^\d+$/.test(c)
      );
      const marcador = th[th.length - 1] ?? "";
      if (equipos.length < 2) {
        actual = null;
        continue;
      }
      const [marcadorLocal, marcadorVisitante] = parseMarcadorEncuentro(marcador);
      actual = {
        ronda,
        local: equipos[0],
        visitante: equipos[1],
        marcadorLocal,
        marcadorVisitante,
        tableros: [],
      };
      encuentros.push(actual);
      continue;
    }

    const numero = NUMERO_TABLERO.exec(fila);
    if (numero && actual) {
      const nombres = [...fila.matchAll(NOMBRE_CON_COLOR)].map((m) => ({
        color: m[1],
        nombre: texto(m[2]),
      }));
      const elos = celdas(fila, ELO).map((e) => {
        const n = Number(texto(e));
        return Number.isFinite(n) && n > 0 ? n : null;
      });
      const todasCRc = celdas(fila, CELDA_TD).map(texto);
      const bruto = todasCRc[todasCRc.length - 1] ?? "";
      const { resultadoLocal, incomparecencia } = parseResultadoTablero(bruto);

      // Sin los dos nombres la fila no sirve: mejor saltarla que guardar un tablero
      // a medias que luego se enseñe con un hueco.
      if (nombres.length < 2) continue;

      actual.tableros.push({
        tablero: Number(numero[2]),
        localNombre: nombres[0].nombre,
        localElo: elos[0] ?? null,
        localBlancas: nombres[0].color === "w",
        visitanteNombre: nombres[1].nombre,
        visitanteElo: elos[1] ?? null,
        resultadoLocal,
        incomparecencia,
      });
    }
  }

  return encuentros;
}
