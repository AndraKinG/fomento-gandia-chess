-- Borrar las 4 fichas que no son de socios. SEGUNDO INTENTO.
--
-- POR QUÉ HAY UN SEGUNDO INTENTO: la migración 0016 tenía que borrarlas y **no llegó a
-- ejecutarse**. Se ha comprobado el 2026-08-06 leyendo la base: las cuatro filas siguen
-- ahí, con exactamente los mismos ids que la 0016 nombraba. Como esa migración borraba
-- con doble condición (id **y** nombre), si los ids hubieran estado mal no habría
-- borrado nada — pero los ids son correctos, así que simplemente no se corrió.
--
-- QUÉ SON: dos de probar el importador de ELO FIDE (Carlsen y Nakamura, con sus ids FIDE
-- reales) y dos de probar el de FEDA (Aalbersberg y Aalders, los dos primeros de la
-- lista alfabética de la FEDA). Están `activo = true`, así que salen en los selectores
-- de jugador de la app, que es la molestia real.
--
-- ESTA VEZ NO SE BORRA POR ID, sino por nombre y con dos guardas que hacen imposible
-- llevarse por delante a un socio de verdad:
--   1. que la ficha NO esté en el orden de fuerza de ninguna temporada, y
--   2. que no esté referenciada en ninguna tabla de la app.
-- Comprobado antes de escribir esto: las cuatro cumplen las dos cosas (0 referencias en
-- profiles, link_requests, availability, lineup_boards, board_results vía tableros,
-- games, club_tournament_players, match_boards, team_captains y tournament_attendance).
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

begin;

create temp table a_borrar on commit drop as
  select p.id, p.nombre
  from public.players p
  where p.nombre in (
        'Carlsen, Magnus',
        'Nakamura, Hikaru',
        'Aalbersberg Kroon, Pedro',
        'Aalders, Hendricus'
      )
    -- Guarda 1: nadie del club está fuera del orden de fuerza.
    and not exists (select 1 from public.force_order f where f.player_id = p.id)
    -- Guarda 2: si algo la referencia, no es una ficha de prueba.
    and not exists (select 1 from public.profiles x where x.player_id = p.id)
    and not exists (select 1 from public.link_requests x where x.player_id = p.id)
    and not exists (select 1 from public.availability x where x.player_id = p.id)
    and not exists (select 1 from public.lineup_boards x where x.player_id = p.id)
    and not exists (select 1 from public.games x where x.player_id = p.id)
    and not exists (select 1 from public.games x where x.rival_id = p.id)
    and not exists (select 1 from public.club_tournament_players x where x.player_id = p.id)
    and not exists (select 1 from public.club_pairings x where x.blancas_id = p.id)
    and not exists (select 1 from public.club_pairings x where x.negras_id = p.id)
    and not exists (select 1 from public.club_rounds x where x.descansa_id = p.id)
    and not exists (select 1 from public.match_boards x where x.nuestro_player_id = p.id)
    and not exists (select 1 from public.team_captains x where x.player_id = p.id)
    and not exists (select 1 from public.tournament_attendance x where x.player_id = p.id)
    and not exists (select 1 from public.cars x where x.conductor_id = p.id)
    and not exists (select 1 from public.car_seats x where x.player_id = p.id);

-- Qué se va a borrar, para verlo antes de que pase. Si aquí no salen 4, PARA y avisa:
-- significa que alguna de las guardas ha saltado y esa ficha no es de prueba.
select 'fichas a borrar (esperado 4)' as comprobacion, count(*)::text as valor from a_borrar
union all
select 'nombres', coalesce(string_agg(nombre, ', ' order by nombre), '(ninguna)') from a_borrar;

delete from public.players where id in (select id from a_borrar);

commit;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'fichas en total (esperado 46)' as comprobacion, count(*)::text as valor
  from public.players
union all
select 'filas en el orden de fuerza (esperado 46)', count(*)::text
  from public.force_order
union all
select 'fichas fuera del orden de fuerza (esperado 0)', count(*)::text
  from public.players p
  where not exists (select 1 from public.force_order f where f.player_id = p.id)
union all
select 'quedan Carlsen o Nakamura (esperado 0)', count(*)::text
  from public.players
  where nombre in ('Carlsen, Magnus', 'Nakamura, Hikaru');
