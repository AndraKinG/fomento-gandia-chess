/**
 * Lo poco compartido de ChessPairings: traducir su resultado y sacar el id de un enlace.
 *
 * EL RESTO DE ESTE MÓDULO ERA UN CLIENTE COMPLETO DE SU API REST, y se quitó a propósito
 * el 2026-08-26. Queda escrito para que nadie lo reescriba creyendo que se olvidó:
 *
 * La API existe, es de solo lectura (comprobado: `OPTIONS /tornei` responde `GET, OPTIONS`
 * y un `DELETE` da 405), está documentada en su plugin oficial de WordPress (GPLv2) y
 * funcionaba — se probó contra un torneo real. Base `https://my.chesspairings.org/api/v1`
 * con `Authorization: Bearer <clave>`, y endpoints `/me`, `/tornei`, `/torneo/{id}`,
 * `/torneo/{id}/classifica`, `/torneo/{id}/abbinamenti?turno=`, `/torneo/{id}/iscritti`,
 * `/torneo/{id}/turni`, `/torneo/{id}/bando`.
 *
 * SE DESCARTÓ POR UN MOTIVO QUE NO ES TÉCNICO: **solo sirve los torneos de la cuenta cuya
 * clave esté configurada**, y el propietario quiere que los torneos los cree quien
 * organiza, con su propia cuenta, sin pasar por él. Con la API eso obligaría a guardar la
 * clave de cada organizador —credenciales de terceros en nuestra base— o a que todo
 * pasara por una persona, que es justo lo que se quería evitar.
 *
 * Su página pública no pide nada y sirve el torneo de cualquiera: ver
 * `chesspairings-publico.ts`, que es por donde se lee ahora.
 *
 * Si algún día el club tiene UNA cuenta propia y todos los torneos van ahí, la API daría
 * datos más limpios que un parser de HTML y merecería la pena volver.
 */

/**
 * Su resultado, al vocabulario de la app.
 *
 * SU CODIFICACIÓN, leída de un torneo real y no adivinada: `"1-0"`, `"0-1"`, `"1/2-1/2"`,
 * y `"+--"` para el bye. Es la misma notación que ya usa el resto de la app, así que la
 * traducción es directa.
 *
 * NULL ES "TODAVÍA NO SE HA JUGADO", y no es lo mismo que unas tablas: una ronda en marcha
 * tiene los resultados vacíos, y pintarlos como ½ daría puntos que nadie ha hecho. Es el
 * fallo que no se ve, porque la clasificación sale con pinta de correcta.
 */
export function resultadoDesdeBlancas(
  risultato: string | null | undefined
): "1" | "0.5" | "0" | null {
  const r = (risultato ?? "").trim();
  if (r === "1-0") return "1";
  if (r === "0-1") return "0";
  if (r === "1/2-1/2" || r === "0.5-0.5" || r === "½-½") return "0.5";
  // El bye y cualquier cosa que no reconozcamos: sin resultado de partida. Un bye ya
  // puntúa en SU clasificación, que es la que enseñamos, así que aquí no se recalcula.
  return null;
}

/**
 * El id del torneo a partir de su enlace público.
 *
 * SIRVE PARA VALIDAR LO QUE SE PEGA. Pasó el 2026-08-26: se pegó
 * `my.chesspairings.org/torneo.php?id=5759`, sin el `/pubblico/` que lleva el enlace de
 * verdad. Un enlace sin `id=` no es de un torneo, y guardarlo sin más deja una pantalla
 * que no trae nada y parece que la integración está rota.
 */
export function idDesdeEnlace(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = /[?&]id=(\d{1,9})\b/.exec(url);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
