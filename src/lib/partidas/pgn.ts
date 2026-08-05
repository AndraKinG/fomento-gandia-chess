/**
 * Lectura de ficheros PGN con VARIAS partidas y escritura de PGN para exportar.
 *
 * Es lo que permite traerse las partidas de Lichess o de Chess.com: las dos
 * dejan descargar un `.pgn` con todo el historial, así que un importador que
 * entienda ese formato cubre las dos plataformas —y cualquier otra— sin depender
 * de sus APIs, de nombres de usuario ni de límites de peticiones.
 *
 * Módulo puro: sin red, sin base de datos y sin `chess.js`. Aquí solo se separan
 * partidas y se leen cabeceras; la validación de las jugadas la hace quien lo use.
 */

export type Cabeceras = Record<string, string>;

export type PartidaImportada = {
  pgn: string;
  fecha: string | null;
  rivalNombre: string | null;
  rivalElo: number | null;
  miElo: number | null;
  color: "blancas" | "negras" | null;
  resultado: "1" | "0.5" | "0" | null;
  ronda: number | null;
  torneoTexto: string | null;
  /** false si no se ha podido saber cuál de los dos bandos es el usuario. */
  reconocida: boolean;
};

/**
 * Separa un fichero PGN en partidas.
 *
 * Un PGN multipartida las encadena, y la marca fiable de que empieza una nueva es
 * una cabecera `[Event ...]` a principio de línea. No se puede partir por líneas
 * en blanco: dentro de una partida ya hay una línea en blanco entre las cabeceras
 * y las jugadas.
 */
export function separarPartidas(texto: string): string[] {
  const limpio = texto.replace(/\r\n?/g, "\n").trim();
  if (!limpio) return [];

  const trozos: string[] = [];
  const lineas = limpio.split("\n");
  let actual: string[] = [];

  for (const linea of lineas) {
    const empiezaOtra = /^\s*\[Event\s/i.test(linea);
    // Solo corta si ya había jugadas acumuladas: dos `[Event]` seguidos sin nada
    // entre medias son la misma partida mal formada, no dos partidas.
    if (empiezaOtra && actual.some((l) => l.trim() && !l.trim().startsWith("["))) {
      trozos.push(actual.join("\n").trim());
      actual = [];
    }
    actual.push(linea);
  }
  if (actual.some((l) => l.trim())) trozos.push(actual.join("\n").trim());

  return trozos.filter(Boolean);
}

/** Lee las cabeceras `[Clave "valor"]` de una partida. */
export function leerCabeceras(pgn: string): Cabeceras {
  const cabeceras: Cabeceras = {};
  for (const m of pgn.matchAll(/^\s*\[\s*(\w+)\s+"([^"]*)"\s*\]/gm)) {
    cabeceras[m[1]] = m[2];
  }
  return cabeceras;
}

/**
 * Fecha PGN (`YYYY.MM.DD`) a ISO. Los campos desconocidos van con interrogantes
 * (`2026.??.??`), que es válido en PGN y aquí significa "no hay fecha usable".
 */
export function fechaDePgn(valor: string | undefined): string | null {
  if (!valor) return null;
  const m = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/.exec(valor.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function aEntero(valor: string | undefined): number | null {
  if (!valor) return null;
  const n = Number(valor.trim());
  return Number.isInteger(n) && n >= 0 && n <= 3500 ? n : null;
}

/**
 * Normaliza un nombre para comparar el del PGN con el que dice el usuario.
 *
 * Hace falta porque el mismo jugador aparece como "Pérez García, Luis", "Luis
 * Pérez" o "luisperez99" según la plataforma. Se compara sin acentos, sin
 * mayúsculas y sin nada que no sea letra o número, para que "Pérez_García" y
 * "perezgarcia" se reconozcan.
 */
export function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** ¿Es el mismo jugador? Coincidencia exacta o uno contenido en el otro. */
function esElMismo(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Convierte una partida de un PGN a los campos de la app, averiguando cuál de
 * los dos bandos es el usuario a partir de los nombres o usuarios que declara.
 *
 * `misNombres` son las formas en las que puede aparecer: su nombre del club, su
 * usuario de Lichess, el de Chess.com… Si no coincide con ninguno, la partida se
 * devuelve con `reconocida: false` para que la interfaz le pregunte en vez de
 * adivinar y guardar la partida con los colores al revés.
 */
export function aPartidaImportada(pgn: string, misNombres: string[]): PartidaImportada {
  const c = leerCabeceras(pgn);
  const blanco = c.White ?? "";
  const negro = c.Black ?? "";

  const soyBlanco = misNombres.some((n) => blanco && esElMismo(blanco, n));
  const soyNegro = misNombres.some((n) => negro && esElMismo(negro, n));
  // Si coincide con los dos (nombres muy cortos, un "a" suelto) no se sabe.
  const reconocida = soyBlanco !== soyNegro;
  const color = !reconocida ? null : soyBlanco ? "blancas" : "negras";

  const bruto = (c.Result ?? "").trim();
  let resultado: PartidaImportada["resultado"] = null;
  if (reconocida) {
    if (bruto === "1/2-1/2") resultado = "0.5";
    else if (bruto === "1-0") resultado = soyBlanco ? "1" : "0";
    else if (bruto === "0-1") resultado = soyBlanco ? "0" : "1";
  }

  const rondaBruta = (c.Round ?? "").trim();
  const ronda = /^\d+$/.test(rondaBruta) ? Number(rondaBruta) : null;

  // El torneo: `Event` salvo cuando es el relleno de las plataformas.
  const evento = (c.Event ?? "").trim();
  const torneoTexto =
    evento && !/^(casual|rated|online)\b/i.test(evento) && evento !== "?" ? evento : null;

  return {
    pgn: pgn.trim(),
    fecha: fechaDePgn(c.UTCDate ?? c.Date),
    rivalNombre: !reconocida ? null : soyBlanco ? negro || null : blanco || null,
    rivalElo: !reconocida ? null : aEntero(soyBlanco ? c.BlackElo : c.WhiteElo),
    miElo: !reconocida ? null : aEntero(soyBlanco ? c.WhiteElo : c.BlackElo),
    color,
    resultado,
    ronda: ronda && ronda > 0 ? ronda : null,
    torneoTexto,
    reconocida,
  };
}

/**
 * Escribe un PGN exportable a partir de las partidas guardadas.
 *
 * Se reconstruyen las cabeceras estándar desde los datos de la app para que el
 * fichero valga en Lichess, Chess.com o cualquier analizador, aunque la partida
 * se hubiera metido a mano en el tablero y su PGN no tuviera cabeceras.
 */
export function aPgnExportable(
  partidas: {
    fecha: string;
    ronda: number | null;
    color: string;
    resultado: string;
    duenio: string;
    rivalNombre: string;
    miElo: number | null;
    rivalElo: number | null;
    torneo: string | null;
    pgn: string | null;
  }[]
): string {
  const bloques = partidas.map((p) => {
    const blanco = p.color === "blancas" ? p.duenio : p.rivalNombre;
    const negro = p.color === "blancas" ? p.rivalNombre : p.duenio;
    const eloBlanco = p.color === "blancas" ? p.miElo : p.rivalElo;
    const eloNegro = p.color === "blancas" ? p.rivalElo : p.miElo;
    const resultado =
      p.resultado === "0.5"
        ? "1/2-1/2"
        : p.color === "blancas"
          ? p.resultado === "1"
            ? "1-0"
            : "0-1"
          : p.resultado === "1"
            ? "0-1"
            : "1-0";

    const cabeceras = [
      `[Event "${escapar(p.torneo ?? "Partida de club")}"]`,
      `[Date "${p.fecha.replace(/-/g, ".")}"]`,
      ...(p.ronda ? [`[Round "${p.ronda}"]`] : []),
      `[White "${escapar(blanco)}"]`,
      `[Black "${escapar(negro)}"]`,
      `[Result "${resultado}"]`,
      ...(eloBlanco ? [`[WhiteElo "${eloBlanco}"]`] : []),
      ...(eloNegro ? [`[BlackElo "${eloNegro}"]`] : []),
    ].join("\n");

    // Si la partida no tiene jugadas, se exporta solo con sus datos: sigue siendo
    // un PGN válido y conserva el registro, que es lo que se está exportando.
    const cuerpo = quitarCabeceras(p.pgn ?? "").trim() || resultado;
    return `${cabeceras}\n\n${cuerpo}`;
  });

  return bloques.join("\n\n");
}

function escapar(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Quita las cabeceras de un PGN y deja solo las jugadas. */
export function quitarCabeceras(pgn: string): string {
  return pgn
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*\[\s*\w+\s+"/.test(l))
    .join("\n")
    .trim();
}
