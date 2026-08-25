-- Los tres ELOs de la FIDE y los puntos que llevas ganados desde la última publicación.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0045.
--
-- QUÉ SE PIDIÓ, y conviene dejarlo escrito porque hubo un malentendido: al hablar de
-- "ELO aproximado", un socio de la junta se refería a ESTO — la FIDE publica los ratings
-- UNA VEZ AL MES, pero en el perfil de cada jugador enseña además cuántos puntos lleva
-- ganados o perdidos en lo que ha jugado desde entonces ("Expected +5"), y que se le
-- aplicarán en la próxima publicación. Es el número que mira todo el mundo al día
-- siguiente de un torneo, porque el oficial no se mueve hasta el mes que viene. NO es un
-- ELO estimado a mano: no hay nada que escribir, solo leerlo y enseñarlo.
--
-- Y LAS TRES MODALIDADES, que es la otra mitad: clásicas, rápidas y blitz. Hasta ahora
-- solo se guardaba el de clásicas (`elo_fide`), que es el que manda para el Interclubs;
-- las otras dos estaban solo en el perfil de la FIDE, y el club las mira igual.
--
-- LA VARIACIÓN LLEVA DECIMALES y por eso es `real` y no `int`: los valores reales de los
-- socios son 23.4, -36.4, 45.60. Redondeando, un "+0,4" se leería como "sin cambios".
--
-- NULL NO ES CERO: null = no ha jugado nada desde la última publicación; cero = ha
-- jugado y está igual. En pantalla las dos no se pintan, pero no significan lo mismo.
--
-- DE DÓNDE SALE Y POR QUÉ NO SE ACTUALIZA SOLO: de ratings.fide.com, y **fide.com
-- bloquea las IPs de centro de datos** (Vercel y GitHub Actions, ya verificado y escrito
-- en CLAUDE.md). Así que esto lo rellena `scripts/actualizar-elo-fide.mjs` ejecutado a
-- mano desde una conexión doméstica. De ahí `elo_fide_leido_en`: un número que se mueve
-- todos los días tiene que decir de cuándo es, o se lee como si fuera de hoy.
alter table public.players
  add column if not exists elo_fide_rapidas int
    check (elo_fide_rapidas is null or (elo_fide_rapidas between 500 and 3500)),
  add column if not exists elo_fide_blitz int
    check (elo_fide_blitz is null or (elo_fide_blitz between 500 and 3500)),
  add column if not exists variacion_fide real,
  add column if not exists variacion_fide_rapidas real,
  add column if not exists variacion_fide_blitz real,
  add column if not exists elo_fide_leido_en timestamptz;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columnas nuevas (esperado 6)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.players'::regclass
    and attname in ('elo_fide_rapidas', 'elo_fide_blitz', 'variacion_fide',
                    'variacion_fide_rapidas', 'variacion_fide_blitz', 'elo_fide_leido_en')
    and attnum > 0 and not attisdropped;
