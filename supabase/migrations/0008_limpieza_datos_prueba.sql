-- Limpieza de los datos de prueba de las Fases 0-1C, antes de dar acceso al
-- club (pendiente que quedaba abierto en CLAUDE.md, "Estado y pendientes").
--
-- GATE USUARIO: como 0001-0007, este fichero NO se aplica automáticamente.
-- Copiar al SQL Editor de Supabase y ejecutarlo a mano.
--
-- Qué borra (alcance decidido por el propietario el 2026-08-05):
--   1. El encuentro falso "Amistoso de prueba" (ronda 99 del equipo A) con su
--      convocatoria publicada, sus 8 tableros y sus 8 resultados.
--   2. Las 2 cuentas de auth `*.prueba@fomentogandia.test` (una de ellas era
--      admin) con sus profiles y link_requests en cascada.
--   3. Las 3 fichas "Jugador Prueba, {Uno,Bis,Dos}".
--
-- Qué NO borra, a propósito:
--   - Las fichas "Carlsen, Magnus" y "Nakamura, Hikaru" (restos de probar el
--     import de ELO FIDE) ni "Aalbersberg Kroon, Pedro" / "Aalders, Hendricus"
--     (restos del import FEDA). Están fuera del orden de fuerza y no estorban;
--     el propietario decidió conservarlas por ahora.
--   - Nada de la cuenta real jony9vcf@gmail.com: su profile, su link_request,
--     su capitanía del equipo A y su suscripción push quedan intactas.
--
-- Comprobado antes de escribir esto (vía REST con service_role): ninguna de
-- las 3 fichas de prueba aparece en `lineup_boards`, `team_captains` ni
-- `availability`, así que su borrado no arrastra ningún dato real. La única
-- suscripción de `push_subscriptions` es la del propietario.
--
-- Todos los DELETE llevan doble condición (id + nombre/email/rival): si algún
-- id no coincidiera con lo esperado, la sentencia borra 0 filas en vez de
-- borrar la fila equivocada.

-- ---------------------------------------------------------------------------
-- Paso 1 — Encuentro de prueba "Amistoso de prueba" (ronda 99, equipo A)
-- ---------------------------------------------------------------------------
-- El trigger `blindaje_lineups` (migración 0007) prohíbe DELETE sobre una
-- lineup cuyo encuentro esté en estado 'jugado', y este encuentro lo está.
-- Su único bypass es `current_setting('role') = 'service_role'`, y el SQL
-- Editor corre como `postgres`, NO como service_role: sin el `set local role`
-- de abajo, el borrado del match falla al cascadear a `lineups` y la
-- transacción entera se revierte.
--
-- `set local` limita el cambio de rol a esta transacción: al hacer commit se
-- vuelve solo a `postgres`. Se hace en su propia transacción porque el paso 2
-- toca `auth.users`, donde `service_role` no tiene privilegios de borrado.
begin;

set local role service_role;

-- Cascadas que dispara este único DELETE (todas declaradas en 0004/0005):
--   matches -> lineups -> lineup_boards -> board_results
--   matches -> availability
delete from public.matches
where id = 'dc9f09d4-a6e6-4d02-b71b-90c0cd31ead9'
  and ronda = 99
  and rival = 'Amistoso de prueba';

commit;

-- ---------------------------------------------------------------------------
-- Paso 2 — Cuentas de auth de prueba
-- ---------------------------------------------------------------------------
-- Cascadas: auth.users -> public.profiles (0001) -> link_requests y
-- push_subscriptions (0001/0002). También se llevan las identities, sesiones y
-- refresh tokens del esquema auth, que cascadean desde auth.users de serie.
begin;

delete from auth.users
where id in (
        '3af8c14d-a15b-4deb-b613-7f79ae2b7400',  -- jugador.prueba@
        'f18c295b-d698-428f-845d-7d3a06dbe986'   -- admin.prueba@ (era is_admin)
      )
  and email like '%@fomentogandia.test';

commit;

-- ---------------------------------------------------------------------------
-- Paso 3 — Fichas de jugador de prueba
-- ---------------------------------------------------------------------------
-- Va después del paso 2 a propósito: al desaparecer ya los profiles y
-- link_requests que las referenciaban, este DELETE no arrastra nada más.
begin;

delete from public.players
where id in (
        '70a2c10b-a979-4e0b-ae94-9a257cf3e5c9',  -- Jugador Prueba, Uno
        '3dcc2d08-b55b-42f6-85b7-3e0e7f5ccca0',  -- Jugador Prueba, Bis
        'f7153e80-f4e3-40ea-9082-494012343ed4'   -- Jugador Prueba, Dos
      )
  and nombre like 'Jugador Prueba,%';

commit;

-- ---------------------------------------------------------------------------
-- Verificación — debe devolver 0 en las 5 primeras filas
-- ---------------------------------------------------------------------------
select 'cuentas .test que quedan'      as comprobacion,
       count(*)                        as debe_ser_cero
  from auth.users where email like '%@fomentogandia.test'
union all
select 'fichas "Jugador Prueba"',       count(*)
  from public.players where nombre like 'Jugador Prueba,%'
union all
select 'encuentros ronda 99',           count(*)
  from public.matches where ronda = 99
union all
select 'convocatorias huerfanas',       count(*)
  from public.lineups l
  where not exists (select 1 from public.matches m where m.id = l.match_id)
union all
select 'profiles sin cuenta de auth',   count(*)
  from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id)
union all
select '-- a partir de aqui, valores esperados --', null::bigint
union all
select 'players (esperado 50)',         count(*) from public.players
union all
select 'orden de fuerza (esperado 46)', count(*) from public.force_order
union all
select 'profiles (esperado 1)',         count(*) from public.profiles
union all
select 'matches (esperado 31)',         count(*) from public.matches
union all
select 'convocatorias (esperado 1)',    count(*) from public.lineups
union all
select 'resultados tablero (esp. 8)',   count(*) from public.board_results
union all
select 'capitanes (esperado 1)',        count(*) from public.team_captains
union all
select 'suscripciones push (esp. 1)',   count(*) from public.push_subscriptions;
