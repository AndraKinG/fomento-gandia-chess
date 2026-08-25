/**
 * Los ENLACES de cada torneo del calendario de la FACV: su página con las bases y, si
 * la hay, la de resultados en vivo.
 *
 * ESTO CORRIGE UN ERROR ANTERIOR, y conviene dejarlo escrito para no repetirlo: se dio
 * por hecho que "la FACV no tiene página por torneo" tras comprobar `calendario_oficial.php`,
 * que efectivamente publica siete columnas y CERO enlaces. Pero se estaba mirando la
 * página equivocada. **La portada de facv.org embute otro widget**,
 * `staff/torneos/list_calendario.php`, y ese sí trae, tarjeta a tarjeta, el enlace a la
 * entrada de WordPress con las bases (`facv.org/xii-torneo-de-ajedrez-ciutat-de-burjassot-sub-2400`)
 * y a veces el de info64 o la retransmisión. Lo encontró el propietario, enseñando una
 * captura de esas tarjetas. LECCIÓN: "esta fuente no lo tiene" solo vale para LA FUENTE
 * QUE SE MIRÓ.
 *
 * SE CASA POR NOMBRE + DÍA Y MES, y no por un id: el widget trae un `data-id` propio de
 * la FACV en su desplegable, pero las TARJETAS —que son las que llevan los enlaces— solo
 * dan nombre, sitio y día. Como los nombres salen de la misma base que el calendario que
 * ya importamos, casan tal cual; el año lo pone nuestra propia fila. Medido el
 * 2026-08-16: **43 de los 44 torneos próximos encuentran su tarjeta**, y 20 de ellos
 * tienen página. El que falla es uno al que la FACV le cambió la fecha.
 *
 * EL WIDGET ES UNA VENTANA MÓVIL: enseña los de ahora y los que vienen, no el año
 * entero. De los 147 importados casan 45, y los que no son todos de enero a marzo. Da
 * igual: el enlace hace falta para el torneo al que aún puedes ir.
 *
 * MÓDULO PURO Y CON TESTS SOBRE HTML REAL: parser de página ajena, o sea de los que se
 * rompen en silencio el día que rediseñan la web.
 */

import { normalizaNombre } from "./facv-calendario";

export type FichaTorneoFACV = {
  nombre: string;
  /** El sitio, como lo escribe el widget: "(Sant Joanet)" ya limpio. */
  lugar: string | null;
  dia: number;
  mes: number;
  /** La entrada de la FACV con las bases. null si no la han publicado. */
  urlFacv: string | null;
  /** info64, chess-results… lo que la FACV enlace como "seguir el torneo". */
  urlResultados: string | null;
};

/** La portada de la FACV embute este widget; es el que lleva los enlaces. */
export const URL_WIDGET_CALENDARIO =
  "https://www.facv.org/appwebfacv/public/staff/torneos/list_calendario.php?lang=es";

/** La misma URL, en la página que se pida. */
export function urlWidget(pagina: number): string {
  return pagina <= 1 ? URL_WIDGET_CALENDARIO : `${URL_WIDGET_CALENDARIO}&page=${pagina}`;
}

/** Los meses como los abrevia el widget, en español. */
const MESES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

/** Texto de un trozo de HTML, sin etiquetas ni entidades. */
function textoPlano(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuántas páginas tiene el widget, leído de su propia paginación. */
export function cuantasPaginas(html: string): number {
  const numeros = [...html.matchAll(/list_calendario\.php\?lang=[a-z]+&(?:amp;)?page=(\d+)/g)].map(
    (m) => Number(m[1])
  );
  return numeros.length > 0 ? Math.max(...numeros) : 1;
}

/** Las tarjetas de una página del widget. */
export function parsearFichasTorneo(html: string): FichaTorneoFACV[] {
  const fichas: FichaTorneoFACV[] = [];
  for (const fila of html.match(/<tr class="[^"]*">[\s\S]*?<\/tr>/g) ?? []) {
    const mes = /class="cal-month">\s*([A-ZÑ]{3})\s*</.exec(fila)?.[1];
    const dia = /class="cal-day">\s*(\d{1,2})/.exec(fila)?.[1];
    // El título va dentro de `card-title`, con o sin enlace: los torneos sin página
    // publicada llevan el nombre en texto suelto, y también nos interesan.
    const titulo = /class="card-title[^"]*">([\s\S]*?)<\/div>/.exec(fila)?.[1];
    if (!mes || !dia || !titulo || !MESES[mes]) continue;
    const nombre = textoPlano(titulo);
    if (!nombre) continue;
    const lugar = textoPlano(/class="nombrelugar">([\s\S]*?)<\/span>/.exec(fila)?.[1] ?? "")
      .replace(/^\(|\)$/g, "")
      .trim();
    fichas.push({
      nombre,
      lugar: lugar || null,
      dia: Number(dia),
      mes: MESES[mes],
      // El enlace del TÍTULO es la entrada con las bases. Se busca dentro de
      // `card-title` a propósito: la tarjeta lleva más enlaces (resultados,
      // retransmisión) y coger "el primer <a> de la fila" traería el que no es.
      urlFacv: /class="card-title[^"]*">\s*<a href="([^"]+)"/.exec(fila)?.[1] ?? null,
      urlResultados: /class="estado-chip" href="([^"]+)"/.exec(fila)?.[1] ?? null,
    });
  }
  return fichas;
}

/**
 * La clave con la que se casa una tarjeta con un torneo nuestro.
 *
 * Nombre normalizado + día + mes. Sin año porque la tarjeta no lo dice, y no hace falta:
 * el calendario que tenemos es de una temporada.
 */
export function claveDeFicha(nombre: string, dia: number, mes: number): string {
  return `${normalizaNombre(nombre)}|${dia}|${mes}`;
}

/** La misma clave, desde una fila nuestra (`fecha_inicio` en ISO). */
export function claveDeTorneo(nombre: string, fechaInicio: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaInicio);
  if (!m) return null;
  return claveDeFicha(nombre, Number(m[3]), Number(m[2]));
}
