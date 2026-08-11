# Inventario de automatizaciones

_Escrito el 2026-08-11. Actualizar cuando se añada o se retire una automatización._

## Qué está automatizado hoy

**Despliegue.** Push a `main` → Vercel construye y despliega. Sin pasos manuales.

**Un solo cron, diario (9:00 UTC), multiplexado por día** — `/api/cron/director`,
programado en `vercel.json`. Protegido por `CRON_SECRET` (con guarda de secreto
vacío). Qué hace:

| Cuándo         | Qué                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Todos los días | Reintento de avisos con push fallido (`reintentarAvisosFallidos`; barato: índice parcial, lo normal es 0 filas)              |
| Lunes          | Pedir disponibilidad de la semana a los jugadores (push)                                                                     |
| Jueves         | Recordar a quien no ha contestado                                                                                            |
| Viernes        | La sync FACV **en cadena y en este orden**: orden de fuerza → resultados y clasificación → actas por tablero (~18 s medidos) |

El orden del viernes es una **dependencia, no un gusto**: el orden de fuerza crea
las fichas, los otros dos cruzan nombres contra ellas, y las actas necesitan que
las jornadas existan. Vive en `src/lib/import/sync-semanal.ts`.

Para pruebas manuales: `?forzar=pedir|recordar|sync` con el mismo secreto.

**Automático dentro de la app** (sin cron, pasa solo al usarla):

- Partida en vivo de torneo que termina → resultado a la clasificación y PGN al
  repositorio (`cerrarEnElTorneo`).
- ELO del club: no se guarda, se recalcula de las partidas — corregir un resultado
  viejo no deja el ranking mal.
- Todo aviso pasa por `avisar()`: fila en la bandeja + push si toca, con reintento
  diario de los fallidos.
- Los blindajes de datos (histórico de jornadas, chat, columnas de avisos) son
  triggers y policies en la base: nadie tiene que vigilarlos.

**Endpoints manuales bajo `/api/cron`** (existen pero NO están programados; se
llaman a mano con el secreto): `elo-fide`. Ver por qué no está programado abajo.

## Qué NO se puede automatizar (verificado, no volver a intentarlo)

- **ELO FIDE desde Vercel: imposible.** `fide.com` bloquea IPs de centro de datos
  (Vercel y GitHub Actions). Verificado dos veces: rascando perfiles (2026-08-05)
  y descargando la lista mensual con la sonda `/api/cron/sonda-fide`
  (**2026-08-11: `fetch failed` a los 10,5 s**). La sonda se borró ese día tras
  responder su pregunta — su código está en el historial de git si hiciera falta.
  El camino que funciona: `scripts/actualizar-elo-fide.mjs` desde un PC de casa,
  o el botón de Admin → ELO ejecutando la app en local.
- **ELO FEDA: RETIRADO ENTERO (2026-08-11, decisión del propietario).** La FEDA no
  publica listas desde diciembre de 2023, así que el importador solo podía traer
  datos de hace años. Se borraron el endpoint, los botones y el importador (con su
  dependencia `xlsx`); el código está en el historial de git por si algún día
  publican. La columna `players.elo_feda` se queda: es dato, no código.

## Qué es manual a propósito

- **Arranque de temporada** (una vez al año, 4 pasos): cambiar `TEMPORADA_ID_FACV`
  en `facv-config.ts` (código + deploy), importar el orden de fuerza nuevo desde
  Admin, dar de alta los equipos, importar calendario. Automatizar algo anual no
  sale a cuenta: el coste de mantener el automatismo supera al de los 4 pasos.
- **Aplicar migraciones SQL** (gate del propietario, regla de trabajo).
- **Marcar a qué torneos va el club**: es una decisión, no una tarea.

## Candidatos evaluados (2026-08-11)

| Candidato                                                  | Veredicto                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Importador mensual de ELO FIDE en el cron                  | **No se puede** (bloqueo verificado hoy). Alternativa real si algún día importa: lanzar el script local el día 1 de cada mes, a mano.        |
| Recordatorio al capitán de resultados sin meter            | **Buen candidato para la 2027**: el viernes la sync ya detecta discrepancias; añadir un aviso al capitán es barato. Esperar a que haya jornadas. |
| Aviso de "convocatoria aún no publicada" días antes        | Ídem: evaluar cuando arranque la 2027 con datos reales de uso.                                                                                |
| Limpieza de `uso_socios_dia` (> ~400 días)                 | Barato de añadir al director, pero el volumen es ínfimo (≤46 filas/día). Añadirlo cuando la tabla tenga un año.                              |
| Arranque de temporada                                      | No compensa: anual.                                                                                                                          |

**Criterio general**: se automatiza lo que se repite cada semana; lo anual, no.
