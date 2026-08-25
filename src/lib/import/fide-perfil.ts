/**
 * Los ratings de un perfil de la FIDE, con la VARIACIÓN PENDIENTE de cada modalidad.
 *
 * QUÉ ES LA VARIACIÓN PENDIENTE, que es lo que se pidió: la FIDE publica los ratings
 * UNA VEZ AL MES, pero en su perfil enseña además cuántos puntos llevas ganados o
 * perdidos en las partidas jugadas desde entonces, y que se te aplicarán en la próxima
 * publicación ("Expected +5"). Es el número que mira todo el mundo el día después de un
 * torneo, porque el rating oficial no se mueve hasta el mes siguiente.
 *
 * LAS TRES MODALIDADES: clásicas (la FIDE lo llama "standart", con esa errata en su
 * propio HTML), rápidas y blitz. Cada una tiene su rating y su variación, y las dos
 * cosas pueden faltar por separado: hay socios con blitz y sin rápidas, y la variación
 * solo aparece si has jugado algo desde la última publicación.
 *
 * LLEVA DECIMALES, y no es un detalle: los valores reales del club son "23.4", "-36.4",
 * "45.60". Redondear a entero al guardar haría que "+0.4" se leyera como "sin cambios",
 * que es justo lo contrario de lo que dice el perfil.
 *
 * EL SIGNO VIENE EN EL PROPIO NÚMERO cuando es negativo ("-36.4"); la flechita
 * (`fa-angle-up` / `fa-angle-down`) es solo el adorno. Se lee el número, y la flecha se
 * usa nada más que de respaldo por si algún día quitan el menos.
 *
 * MÓDULO PURO Y CON TESTS SOBRE HTML REAL de perfiles del club (ver el test): esto es un
 * parser de HTML ajeno, o sea la clase de código que se rompe el día que rediseñan la
 * página, y sin tests se rompe en silencio y deja los números viejos ahí puestos.
 */

export type ModalidadFide = "clasicas" | "rapidas" | "blitz";

export type RatingFide = {
  /** El rating publicado, o null si no tiene en esa modalidad. */
  elo: number | null;
  /** Puntos ganados o perdidos desde la última publicación. null = no ha jugado. */
  variacion: number | null;
};

export type PerfilFide = Record<ModalidadFide, RatingFide>;

/** Cómo llama la FIDE a cada modalidad en su HTML. "standart" es su errata, no nuestra. */
const CLASES: Record<ModalidadFide, string> = {
  clasicas: "profile-standart",
  rapidas: "profile-rapid",
  blitz: "profile-blitz",
};

const VACIO: RatingFide = { elo: null, variacion: null };

/** El trozo de HTML de una modalidad, del `div` que la abre al siguiente. */
function bloqueDe(html: string, clase: string): string | null {
  const i = html.indexOf(`class="${clase} profile-game`);
  if (i < 0) return null;
  // Hasta el siguiente bloque de modalidad o el comentario que cierra la fila. Se corta
  // por ahí y no por el primer `</div>` porque dentro hay `span` e `img` anidados.
  const resto = html.slice(i);
  const fin = resto.slice(1).search(/class="profile-(standart|rapid|blitz) profile-game|<!--profile-games-->/);
  return fin < 0 ? resto : resto.slice(0, fin + 1);
}

/** El rating: el primer `<p>` del bloque, que es el número grande. */
function eloDe(bloque: string): number | null {
  const m = /<p>\s*(\d{3,4})\s*<\/p>/.exec(bloque);
  if (!m) return null;
  const elo = Number(m[1]);
  return elo >= 500 && elo <= 3500 ? elo : null;
}

/**
 * La variación: el número del `span` de "Expected".
 *
 * Si no hay `span`, no ha jugado desde la última publicación y se devuelve null — que NO
 * es lo mismo que cero: cero sería "ha jugado y está igual".
 */
function variacionDe(bloque: string): number | null {
  const m = /profile-top-rating-dataDesc"[^>]*>([\s\S]*?)<\/span>/.exec(bloque);
  if (!m) return null;
  const texto = m[1].replace(/<[^>]+>/g, " ");
  const numero = /(-?\d+(?:[.,]\d+)?)/.exec(texto);
  if (!numero) return null;
  const valor = Number(numero[1].replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  // Respaldo por si algún día el menos desaparece y solo queda la flecha hacia abajo.
  const baja = /fa-angle-down|color_rd/.test(m[1]);
  return baja && valor > 0 ? -valor : valor;
}

/** Lee las tres modalidades de un perfil de ratings.fide.com. */
export function parsearPerfilFide(html: string): PerfilFide {
  const salida = {} as PerfilFide;
  for (const modalidad of ["clasicas", "rapidas", "blitz"] as ModalidadFide[]) {
    const bloque = bloqueDe(html, CLASES[modalidad]);
    salida[modalidad] = bloque
      ? { elo: eloDe(bloque), variacion: variacionDe(bloque) }
      : { ...VACIO };
  }
  return salida;
}

/** "+23,4" / "−36,4" para pintarlo. null cuando no hay nada que decir. */
export function textoVariacion(variacion: number | null): string | null {
  if (variacion === null || variacion === 0) return null;
  const redondeado = Math.round(variacion * 10) / 10;
  const signo = redondeado > 0 ? "+" : "−";
  return `${signo}${Math.abs(redondeado).toFixed(1).replace(".", ",")}`;
}
