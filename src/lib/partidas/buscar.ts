/**
 * Filtro de búsqueda del repositorio de partidas.
 *
 * QUÉ ESTABA ROTO: la pantalla montaba
 * `or(rival_nombre.ilike.%X%,players.nombre.ilike.%X%)` y PostgREST lo rechazaba
 * entero — "failed to parse logic tree". Dos motivos a la vez:
 *
 * 1. **Dentro de `or()` el comodín es `*`, no `%`.** El `%` va en un `.ilike()`
 *    suelto, pero en el árbol lógico rompe el análisis.
 * 2. **No se puede filtrar por una columna de una tabla incrustada dentro de `or()`**
 *    (`players.nombre`) cuando el embed es un left join, que es el caso.
 *
 * Y como la consulta fallaba entera, la pantalla no enseñaba NINGUNA partida: buscar
 * un nombre dejaba el repositorio en blanco en vez de filtrar.
 *
 * LA SOLUCIÓN es no filtrar por la tabla incrustada: se resuelven antes los socios
 * cuyo nombre coincide y se busca por `player_id`, que es columna propia de `games`.
 */

/** Caracteres que rompen el árbol lógico de PostgREST si van sin comillas. */
const PELIGROSOS = /[(),."\\]/;

/**
 * Escapa un valor para meterlo en un `or()`.
 *
 * Una coma en el texto partiría la condición en dos, y un paréntesis cerraría el
 * grupo antes de tiempo. PostgREST deja entrecomillar el valor para evitarlo.
 */
export function valorSeguro(texto: string): string {
  const patron = `*${texto}*`;
  if (!PELIGROSOS.test(texto)) return patron;
  return `"${patron.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Condición `or` para buscar por nombre del rival o del socio dueño de la partida.
 *
 * `idsJugadores` son las fichas cuyo nombre ya ha cuadrado con el texto. Si no hay
 * ninguna, la condición se queda solo con el rival: meter un `in.()` vacío volvería a
 * romper el análisis.
 */
export function filtroBusqueda(texto: string, idsJugadores: readonly string[]): string {
  const valor = valorSeguro(texto.trim());
  const condiciones = [`rival_nombre.ilike.${valor}`];
  if (idsJugadores.length > 0) {
    condiciones.push(`player_id.in.(${idsJugadores.join(",")})`);
  }
  return condiciones.join(",");
}
