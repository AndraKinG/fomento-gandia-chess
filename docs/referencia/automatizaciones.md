# Inventario de automatizaciones

_Escrito el 2026-08-11. Actualizar cuando se añada o se retire una automatización._

## Qué está automatizado hoy

**Despliegue.** Push a `main` → Vercel construye y despliega. Sin pasos manuales.

**Un solo cron, diario (9:00 UTC), multiplexado por día** — `/api/cron/director`,
programado en `vercel.json`. Protegido por `CRON_SECRET` (con guarda de secreto
vacío). Qué hace:

| Cuándo         | Qué                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Todos los días | Reintento de avisos con push fallido (`reintentarAvisosFallidos`; barato: índice parcial, lo normal es 0 filas)              |
| **Domingo**    | La sync FACV completa: **el día después de la jornada**                                                                      |
| **Lunes**      | La sync FACV **otra vez** (segunda pasada) y luego pedir disponibilidad de la semana                                          |
| Jueves         | Recordar a quien no ha contestado (2 días antes del sábado)                                                                  |

**Y tres pasadas más el fin de semana de jornada, con pg_cron** (migración 0049),
porque la FACV publica los resultados el sábado por la noche o el domingo:

| Cuándo (Madrid) | UTC | Qué |
| --- | --- | --- |
| Sábado 22:00 | `0 21 * * 6` | Resultados y actas (pasada corta) |
| Sábado 23:55 | `55 22 * * 6` | Otra vez, por si el acta se subió de noche |
| Domingo 14:00 | `0 13 * * 0` | Otra vez |

Van por **pg_cron y no por Vercel** porque el plan Hobby permite una ejecución al
día y aquí hacen falta tres a horas concretas. Llaman a
`/api/cron/director?forzar=resultados`, que es la **pasada corta**: solo resultados
y actas. Recién acabada la jornada, el orden de fuerza, el ELO, el calendario de
torneos y sus enlaces son los mismos que por la mañana, así que pedirlos otra vez
serían tres cuartos de las peticiones para traer lo que ya tenemos.

Las horas están calculadas para **invierno (UTC+1)**, que es cuando se juega el
Interclubs (10 de enero a 28 de marzo en 2026). En verano caen una hora más tarde
en local y da igual: no hay jornadas.

**El día sale de cuándo se juega de verdad**, y estuvo mal hasta el 2026-08-26.
Medido sobre las 31 jornadas de la temporada 2026: **28 se jugaron en SÁBADO y 3 en
domingo, todas a las 17:00** — ninguna en viernes. Y la sync estaba puesta el
viernes, o sea el día ANTES de la jornada: recogía los resultados del sábado
anterior con **seis días de retraso**, y entre medias la app enseñaba la
clasificación vieja toda la semana. Era el peor día de los siete.

**Dos pasadas, domingo y lunes**, porque la FACV puede subir las actas el mismo
sábado por la noche, el domingo o el lunes. Si el domingo no hay nada, el lunes lo
recoge; sin la segunda pasada habría que esperar una semana. **No son dos crones**:
el plan Hobby de Vercel permite una ejecución al día, pero un día puede hacer dos
cosas y sale gratis. La sync es idempotente y tarda ~18 s.

**El lunes sincroniza ANTES de pedir disponibilidad**: la sync puede crear la
jornada de ese fin de semana si la FACV la publicó tarde, y al revés se pediría
disponibilidad para una jornada que aún no existe.

La cadena de la sync es una **dependencia, no un gusto**: orden de fuerza →
resultados y clasificación → actas por tablero → ELO real actual → calendario de
torneos → enlaces de cada torneo. El orden de fuerza crea las fichas, los dos
siguientes cruzan nombres contra ellas, las actas necesitan que las jornadas
existan, y los enlaces necesitan que el torneo exista. Vive en
`src/lib/import/sync-semanal.ts`.

**El ELO FIDE y el día 1 del mes**: la FIDE publica lista nueva mensual, con efecto
el día 1. No hace falta un día especial en el cron porque hay dos caminos y los dos
lo cogen: el script local corre **todos los días a las 14:00** (tarea de Windows en
el PC del propietario, la única vía porque fide.com bloquea las IPs de centro de
datos) y, como respaldo si ese PC está apagado, el ranking de la FACV —que Vercel sí
puede descargar— refresca `elo_fide` en la sync del domingo y del lunes.

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

- **fide.com desde Vercel: imposible** (bloquea IPs de datacenter; verificado dos
  veces, perfiles y lista mensual). **PERO YA NO IMPORTA para el ELO de clásicas**:
  el 2026-08-11 se descubrió que el ranking público de la FACV publica el FIDE de
  clásicas AL DÍA y admite filtro por club (POST) — y facv.org sí se puede
  descargar desde Vercel. Ese importador (`facv-elo-actual.ts`) va en el cron del
  viernes. fide.com solo haría falta para rápidas y blitz (perfil a perfil, desde
  casa, `scripts/actualizar-elo-fide.mjs`).
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
| Importador de ELO real en el cron                          | **RESUELTO el mismo día**: vía el ranking FACV (clásicas al día, filtrado por club, desde Vercel). Rápidas y blitz seguirían necesitando fide.com desde casa. |
| Recordatorio al capitán de resultados sin meter            | **Buen candidato para la 2027**: el viernes la sync ya detecta discrepancias; añadir un aviso al capitán es barato. Esperar a que haya jornadas. |
| Aviso de "convocatoria aún no publicada" días antes        | Ídem: evaluar cuando arranque la 2027 con datos reales de uso.                                                                                |
| Limpieza de `uso_socios_dia` (> ~400 días)                 | Barato de añadir al director, pero el volumen es ínfimo (≤46 filas/día). Añadirlo cuando la tabla tenga un año.                              |
| Arranque de temporada                                      | No compensa: anual.                                                                                                                          |

**Criterio general**: se automatiza lo que se repite cada semana; lo anual, no.
