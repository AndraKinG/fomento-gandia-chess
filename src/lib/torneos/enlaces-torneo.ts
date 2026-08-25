/**
 * A dónde mandar a alguien que quiere saber más de un torneo de fuera.
 *
 * LO PRIMERO, PORQUE CAMBIA LA RESPUESTA: **la FACV no tiene página por torneo**.
 * Comprobado contra la página en vivo el 2026-08-16 (y ya estaba dicho en la migración
 * 0010): su calendario oficial publica SIETE columnas —#, nombre, inicio, final, lugar,
 * organizador y "bloquea"— y CERO enlaces en las 171 filas. O sea que "poner la URL de
 * la FACV con la info" no se puede hacer: esa URL no existe. Lo único suyo que se puede
 * enlazar es el calendario entero, que es la lista de la que salió el torneo.
 *
 * ASÍ QUE LA INFO DE VERDAD ESTÁ EN DOS SITIOS: en **info64.org**, que es donde los
 * organizadores de aquí publican bases, inscritos, emparejamientos y resultados (lo
 * propuso un socio de la junta como fuente), y en NUESTRA PROPIA FICHA, que es la que
 * hay que rellenar cuando alguien se enteró por otro lado.
 *
 * EL BUSCADOR DE INFO64 SE VERIFICÓ EN UN NAVEGADOR DE VERDAD, no adivinando la URL: su
 * formulario es un GET con el campo `name` (`/search?name=…`), y el `?q=…` que parecía
 * lo obvio se ignora y devuelve "no se han encontrado torneos". La página se pinta con
 * JavaScript, así que descargarla con `fetch` no enseña los resultados y no vale para
 * comprobarlo — hubo que abrirla.
 *
 * MÓDULO PURO Y CON TESTS: son URLs y recortes de texto, y una URL mal montada no falla,
 * solo lleva a una página vacía.
 */

import { URL_CALENDARIO_TORNEOS } from "@/lib/import/facv-calendario-torneos";

/** El calendario oficial de la FACV, de donde salen los torneos importados. */
export const URL_CALENDARIO_FACV = URL_CALENDARIO_TORNEOS;

/**
 * Cómo se saca de un nombre de la FACV algo que info64 encuentre.
 *
 * ESTO NO ES UNA CORAZONADA: los nombres de las dos fuentes NO COINCIDEN casi nunca, y
 * se comprobó torneo por torneo contra info64 en vivo el 2026-08-16. La FACV llama
 * "S2400 Oropesa del Mar" a lo que info64 tiene como "V IRT-SUB2400 OROPESA DEL MAR", y
 * "Open Rápidas Dama Roja" a "Open Internacional Rapidas Dama Roja". Buscar el nombre
 * COMPLETO devuelve CERO resultados en los dos casos.
 *
 * LO QUE SÍ COMPARTEN ES EL FINAL DEL NOMBRE: el sitio o el club ("Oropesa del Mar",
 * "Dama Roja", "Ciudad de Sueca"). Los principios son los que cada uno escribe a su
 * manera —códigos, números de edición y palabras genéricas—, así que se quitan.
 *
 * Y SE PARA A LAS DOS PALABRAS, que es la parte que costó afinar: quitando genéricas sin
 * freno, "IRT Internacional Alicante" se queda en "Alicante" y devuelve 152 torneos, en
 * vez del único que sale buscando "Internacional Alicante". Dos palabras es lo que
 * distingue sin ahogar.
 *
 * MEDIDO, con el número de resultados de cada uno:
 *   "S2400 Oropesa del Mar"                → "Oropesa del Mar"   → 6
 *   "IRT Internacional Alicante"           → "Internacional Alicante" → 1
 *   "Open Rápidas Dama Roja"               → "Dama Roja"         → 11
 *   "X Open Internacional Ciudad de Sueca" → "Ciudad de Sueca"   → 1
 *
 * SE PREFIERE PASARSE DE ANCHO QUE QUEDARSE CORTO: con once resultados y sus fechas
 * delante, el torneo se reconoce de un vistazo; con "no se han encontrado torneos", uno
 * concluye que no está — y estaría.
 *
 * LOS ACENTOS SE DEJAN TAL CUAL: el buscador de info64 es insensible a tildes
 * (comprobado: "Rápidas" y "Rapidas" devuelven los mismos 110 torneos, "València" y
 * "Valencia" los mismos 162), así que quitarlos no aportaría nada y el formulario se ve
 * con el nombre de verdad.
 */

/**
 * Números de edición al principio: romanos y en cifra.
 *
 * SOLO LETRAS DE NÚMERO ROMANO (IVXLCDM) y como palabra entera, que es lo que salva
 * "IRT Internacional Alicante": la R y la T no son romanas, así que ese nombre no se
 * toca por aquí. Con un "quita las primeras letras raras" se habría quedado en
 * "Internacional Alicante" por el camino equivocado.
 */
const EDICION_ROMANA = /^[IVXLCDM]{1,6}\b[\s.·–-]*/i;

/**
 * La edición en cifra: "1er", "2º", "3ª", "43".
 *
 * EXIGE UN SEPARADOR DETRÁS y no un límite de palabra: la "º" no es carácter de palabra,
 * así que con `\b` el número se iba y el ordinal se quedaba — "2º Open" acababa
 * buscando "º Open". Y de paso, exigiendo separador, un nombre que empieza por una fecha
 * ("2026-04-28 Sueca", que info64 los tiene así) no se toca.
 */
const EDICION_CIFRA = /^\d{1,3}\s*(?:º|ª|er|nd|th)?[\s.·–-]+/i;

/**
 * Palabras que escriben distinto las dos fuentes, y códigos de categoría.
 *
 * Son las que sobran para encontrar: lo que identifica un torneo es el sitio o el club,
 * no que sea un "open internacional de rápidas".
 */
const GENERICA =
  /^(?:open|torneo|irt|itt|campeonato|memorial|internacional|international|abierto|r[áa]pidas|blitz|magistral|circuito|trofeo|copa|zonal|social|escuela|s\d+|sub-?\s?\d+)\b[\s.·–-]*/i;

/** Con menos de esto no se recorta más: un término de una palabra devuelve el mundo. */
const PALABRAS_MINIMAS = 2;

const cuantasPalabras = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Lo que de verdad se busca de un nombre de torneo. */
export function terminoDeBusqueda(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  let x = limpio.replace(EDICION_ROMANA, "").replace(EDICION_CIFRA, "").trim();

  // Se van quitando genéricas del principio MIENTRAS queden más de dos palabras.
  let antes: string;
  do {
    antes = x;
    if (cuantasPalabras(x) <= PALABRAS_MINIMAS) break;
    x = x.replace(GENERICA, "").trim();
  } while (x !== antes);

  // Si de tanto recortar no queda nada con sentido, se busca el nombre entero: hay
  // torneos que se llaman de verdad con dos letras.
  return x.length >= 4 ? x : limpio;
}

/**
 * Buscar el torneo en info64 por su nombre.
 *
 * ES UNA BÚSQUEDA Y NO UNA FICHA, y por eso el enlace se llama "buscar": info64 usa
 * direcciones con el nombre en el propio enlace (`/x-open-internacional-ciudad-de-sueca`)
 * y adivinarlas fallaría en cuanto el nombre no coincidiera letra por letra con el de la
 * FACV, que es casi siempre. Llegar al buscador con el nombre ya escrito siempre
 * funciona, y si el torneo no está, se ve que no está.
 */
export function enlaceInfo64(nombre: string): string {
  return `https://info64.org/search?name=${encodeURIComponent(terminoDeBusqueda(nombre))}`;
}

/**
 * LO QUE ESTO NO PUEDE ARREGLAR, para no volver a intentarlo: la FACV escribe los sitios
 * en valenciano ("Orpesa", "Alacant", "Ciutat de Gandia") e info64 en castellano
 * ("Oropesa", "Alicante", "Ciudad de Gandia"). Comprobado con su campo de ciudad:
 * `city=Orpesa` da 0 y `city=Oropesa` da 25; `city=Alacant` da 36 y `city=Alicante`
 * da 452. Ninguna regla de recorte salva eso, porque no es cuestión de recortar sino de
 * traducir. Para esos casos está el enlace a las bases y la información que se escribe a
 * mano en la propia ficha del torneo.
 */
