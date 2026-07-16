/**
 * Identificadores FACV usados por los importadores de este directorio (orden
 * de fuerza, calendario, resultados/clasificación). Centralizados aquí para
 * no tener que buscar en varios ficheros cuando cambien.
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

/**
 * Nombre base del club tal y como aparece en las páginas públicas FACV
 * (calendario, resultados), usado para filtrar los encuentros propios entre
 * todos los grupos de Interclubs.
 */
export const NOMBRE_CLUB_FACV = "Fomento";
