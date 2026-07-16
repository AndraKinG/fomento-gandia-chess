/**
 * Identificadores FACV usados por los importadores de este directorio (orden
 * de fuerza, calendario, resultados/clasificación). Centralizados aquí para
 * no tener que buscar en varios ficheros cuando cambien.
 * El nombre del club para filtrado de encuentros vive en la tabla teams (no aquí).
 */

/**
 * Id del club en la web pública FACV (parámetro `id` de `of_publico.php`).
 * Estable entre temporadas: sólo cambiaría si la FACV reasigna el id del
 * club, algo que no ha ocurrido nunca hasta ahora.
 */
export const CLUB_ID_FACV = 56;

/**
 * Id de la temporada de Interclubs en la web pública FACV (parámetro `id` de
 * `calendario_publico.php`). ACTUALIZAR CADA TEMPORADA: la FACV asigna un id
 * nuevo cada año para el calendario de Interclubs.
 */
export const TEMPORADA_ID_FACV = 1428;
