# Verificación empírica de dos ambigüedades del RGC (Task 8, Fase 1C)

Investigación con datos REALES de la temporada Interclubs FACV 2026 (ya
terminada a fecha de esta verificación, 2026-07-15), cruzando:

- El calendario público FACV (`calendario_publico.php?id=1428&r=0`), que
  enlaza, por cada grupo, a las páginas de **chess-results** con las
  alineaciones por ronda (`art=3`) y la clasificación (`art=46`).
- El `force_order` de nuestro club en la base de datos (numeración oficial
  del orden de fuerza, sincronizada de la página FACV en Fase 1B).

Presupuesto: ~35 min. Ambas ambigüedades quedan documentadas con datos
concretos; ninguna se resuelve de forma concluyente porque los datos reales
del club, honestamente, no contienen el caso que haría falta observar.

## a) `permitirInversionDentroMargen` (arts. 51.2 vs 52.3)

**Método**: se descargaron las alineaciones reales (chess-results, `art=3`)
de las **11 rondas completas** del equipo A (1ª Autonómica Sur, `margen_elo
= 200` en la BD) de la temporada 2026, torneo
`https://chess-results.com/tnr1326331.aspx`. Para cada ronda se extrajo el
orden de tablero (1-8) de los jugadores de Fomento de Gandía realmente
alineados y se comparó con su `numero` oficial en `force_order`
(sincronizado de la FACV).

**Resultado**: en las **11 de 11 rondas** el club alineó a sus jugadores
disponibles en **estricto orden de `numero` oficial**, sin ninguna
inversión — simplemente saltando a los jugadores no convocados esa ronda.
Ejemplos (ronda 1, `tnr1326331`, `rd=1`, `art=3`):

| Tablero | Jugador | `numero` OF | Elo mostrado |
|---|---|---|---|
| 1 | Crecente Penalba, José Manuel | 1 | 2087 |
| 2 | Frasquet Solbes, Elías | 2 | 2057 |
| 3 | Vercher Sansaloni, Juan Emilio | 3 | 1980 |
| 4 | Muñoz Martí, Miguel | 4 | 1866 |
| 5 | García Coll, Santiago | 5 | 1884 |
| 6 | González Rodríguez, Manuel | 6 | 1950 |
| 7 | Vallalta Martínez, Luis | 7 | 1946 |
| 8 | Galiana Cremades, José | 10 (salta 8 y 9, no convocados) | 1854 |

Mismo patrón (secuencia de `numero` estrictamente creciente, con huecos solo
por ausencias) en las rondas 2, 3, 4, 5, 6, 7, 8, 9, 10 y 11.

Dato curioso pero IRRELEVANTE para la ambigüedad: el `numero` oficial 4
(Muñoz Martí, elo 1866) va delante del `numero` 5 (García Coll, elo 1884)
en TODAS las rondas — el elo mostrado por chess-results no es
monótonamente decreciente con el `numero`. Esto no es una inversión: el
`force_order` oficial de la FACV ya viene así (probablemente por elo
FIDE/FEDA de referencia distinto al que muestra chess-results); el club se
limita a seguir su `numero` al pie de la letra, así que no dice nada sobre
qué pasaría si alguien invirtiese el orden real.

**Veredicto**: **NO se encontraron inversiones reales** en los datos de
nuestro club con margen configurado (200). El club juega siempre en orden
estricto de `numero`, así que no hay ningún caso real observable de "¿qué
hace la FACV cuando hay una inversión con diferencia de ELO < margen?" —
la pregunta queda **sin resolver por falta de un caso real propio**, no
porque las fuentes se resistieran (al contrario: la alineación por ronda
de chess-results es perfectamente parseable y pública). Sería necesario
encontrar una inversión real en OTRO club de la misma categoría (con
margen configurado) y comprobar si la FACV homologó el acta sin sanción,
lo cual excede el presupuesto de esta tarea. Se mantiene sin cambiar el
comportamiento por defecto del validador (`permitirInversionDentroMargen`
sigue siendo un campo obligatorio sin valor implícito).

Nota: los equipos B y C del club tienen `margen_elo = null` (orden
estricto sin margen configurado en absoluto), así que sus alineaciones no
aportan evidencia sobre esta ambigüedad en concreto (el 51.2 puro se exige
siempre ahí, en ambas lecturas).

## b) Recuento de bloques de bis

**Método**: consulta directa a `force_order` de la temporada activa
(`season_id` de "Interclubs 2026 (pruebas)") filtrando `bis_index = 1`.

**Resultado**: `[]` — cero filas. Confirmado también por inspección: los
46 jugadores del orden de fuerza 2026 tienen `bis_index = 0`.

**Veredicto**: **no hay ningún "bis" en los datos reales de la temporada
2026 de este club** (consistente con lo ya observado en fixtures previos
de Fase 1B). La ambigüedad sobre cómo contar bloques de bis para los
límites de tableros/categoría queda **sin resolver por falta de caso
real** — honestamente, no hay ningún dato empírico propio que la ilumine
esta temporada. No se ha tocado el comportamiento del validador.

## Limitaciones

La comparación del apartado (a) usó el `force_order` sincronizado a FINAL
de temporada (snapshot único, descargado con la temporada 2026 ya
terminada), no el vigente en la fecha de cada ronda. Si la FACV hubiera
renumerado el orden de fuerza a mitad de temporada (altas, bajas o
correcciones), el juicio "orden estrictamente creciente" sobre las rondas
anteriores al cambio se habría hecho contra una numeración que no era la
aplicable entonces, y alguna ronda temprana podría en realidad contener
una inversión (o dejar de contenerla). No consta ninguna renumeración esta
temporada, pero no se verificó ronda a ronda. La conclusión de **cero
inversiones observadas en 11/11 rondas** se mantiene como evidencia fuerte
— pero no absoluta — de que el club juega en orden estricto de `numero`.
