import { normalizaNombre } from "@/lib/import/facv-calendario";

/**
 * Cruce de nombres de personas entre fuentes que no los escriben igual.
 *
 * EL PROBLEMA, medido sobre los datos reales del club: `players.nombre` tiene DOS
 * FORMATOS mezclados —"Aalbersberg Kroon, Pedro" en las fichas que vinieron del orden
 * de fuerza de la FACV y "Borja Gregori Olivares" en las que se metieron a mano— y las
 * actas de chess-results usan siempre el primero. Comparando las cadenas normalizadas
 * cruzaban CERO de 248 tableros, y el fallo no daba ningún error: simplemente ninguna
 * fila quedaba enlazada a su socio.
 *
 * LA SOLUCIÓN es comparar el CONJUNTO de palabras, que no depende del orden:
 * "Gregori Olivares, Borja" y "Borja Gregori Olivares" dan los dos
 * {borja, gregori, olivares}.
 *
 * Y ADEMÁS UNA SEGUNDA PASADA TOLERANTE, porque chess-results MUTILA nombres de
 * cuatro maneras distintas — las cuatro vistas en las actas reales de 2026:
 *
 *   1. Guiones: "Mafe-Coll, Lorenzo" (la ficha dice "Lorenzo Mafé Coll").
 *   2. Nombres truncados: "Lloren" por "Llorenç" (se comió la ç y lo que seguía).
 *   3. Nombres de pila que faltan: "Hernandez Gonzalez, Jairo" cuando la ficha es
 *      "Jairo Manuel Hernández González" — el "Manuel" no viaja.
 *   4. El año de nacimiento pegado: "..., Manuel 1969", para distinguir tocayos.
 *
 * La segunda pasada acepta una ficha si CADA palabra del acta casa con una palabra
 * DISTINTA de la ficha (igual, o la de la ficha empieza por la del acta con 4+
 * letras), y solo si UNA ÚNICA ficha cumple. En cuanto dos fichas valdrían, no se
 * enlaza ninguna: es preferible dejar el tablero sin ficha —se enseña igual, con el
 * nombre del acta— que colgárselo al socio equivocado.
 *
 * Los APODOS: hay socios cuya ficha va con el nombre de uso ("Ximo") y el acta con
 * el de pila ("Joaquim"). Eso no lo arregla ninguna cadena: la ficha puede llevar
 * un `alias` (migración 0035) cuyas palabras cuentan como propias al cruzar.
 */

/** Palabras del nombre, normalizadas, sin duplicados y sin años de nacimiento. */
export function palabrasNombre(nombre: string): string[] {
  return [
    ...new Set(
      normalizaNombre(nombre)
        // El guion y el apóstrofo parten palabra: "mafe-coll" son dos apellidos.
        .replace(/[.,\-']/g, " ")
        .split(/\s+/)
        .filter((p) => p.length > 0 && !/^(?:19|20)\d{2}$/.test(p))
    ),
  ].sort();
}

/** Clave exacta de un nombre: sus palabras ordenadas. */
export function claveNombre(nombre: string): string {
  return palabrasNombre(nombre).join(" ");
}

export type FichaConNombre = {
  id: string;
  nombre: string;
  /** Nombres alternativos (apodo, nombre de pila oficial…), si los hay. */
  alias?: string | null;
};

export type IndiceFichas = {
  /** Clave exacta → id, sin las ambiguas. */
  exacto: Map<string, string>;
  /** Todas las fichas con sus palabras (nombre + alias), para la pasada tolerante. */
  fichas: { id: string; palabras: string[] }[];
};

/**
 * Índice de fichas para cruzar nombres.
 *
 * Las claves exactas que apuntarían a más de una ficha se eliminan del índice, no
 * se quedan con la primera.
 */
export function indicePorNombre(fichas: readonly FichaConNombre[]): IndiceFichas {
  const cuantas = new Map<string, number>();
  const exacto = new Map<string, string>();
  const conPalabras: IndiceFichas["fichas"] = [];

  for (const f of fichas) {
    const propias = palabrasNombre(f.alias ? `${f.nombre} ${f.alias}` : f.nombre);
    if (propias.length === 0) continue;
    conPalabras.push({ id: f.id, palabras: propias });

    // La clave exacta va SIN el alias: el alias suma tolerancia, no cambia la
    // identidad exacta del nombre tal como está escrito.
    const clave = claveNombre(f.nombre);
    cuantas.set(clave, (cuantas.get(clave) ?? 0) + 1);
    exacto.set(clave, f.id);
  }
  for (const [clave, n] of cuantas) {
    if (n > 1) exacto.delete(clave);
  }
  return { exacto, fichas: conPalabras };
}

/** ¿Casa cada palabra del acta con una palabra DISTINTA de la ficha? */
function casan(delActa: string[], deLaFicha: string[]): boolean {
  const libres = [...deLaFicha];
  for (const palabra of delActa) {
    const i = libres.findIndex(
      (candidata) =>
        candidata === palabra || (palabra.length >= 4 && candidata.startsWith(palabra))
    );
    if (i === -1) return false;
    libres.splice(i, 1);
  }
  return true;
}

/** Id de la ficha que corresponde a `nombre`, o null si no hay una sola clara. */
export function buscarFicha(nombre: string, indice: IndiceFichas): string | null {
  const exacta = indice.exacto.get(claveNombre(nombre));
  if (exacta) return exacta;

  // Pasada tolerante. Con MENOS de dos palabras no se intenta: un solo apellido
  // casaría con media plantilla.
  const palabras = palabrasNombre(nombre);
  if (palabras.length < 2) return null;

  const candidatas = indice.fichas.filter((f) => casan(palabras, f.palabras));
  return candidatas.length === 1 ? candidatas[0].id : null;
}
