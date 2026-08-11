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
| Lunes          | Pedir disponibilidad de la semana a los jugadores (push)                                                                     |
| Jueves         | Recordar a quien no ha contestado                                                                                            |
| Viernes        | La sync FACV **en cadena y en este orden**: orden de fuerza → resultados y clasificación → actas por tablero → **ELO real actual** (FIDE clásicas vía el ranking FACV, `facv-elo-actual.ts`) |

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
