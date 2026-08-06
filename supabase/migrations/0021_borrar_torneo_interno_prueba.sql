-- Borrar el torneo interno de prueba "test interno".
--
-- Estaba en estado 'inscripcion', así que salía destacado en Inicio y en Torneos → Del
-- club como si el club tuviera un torneo abierto.
--
-- Comprobado antes de escribir esto: no tiene inscritos, ni rondas, ni emparejamientos
-- (0 en las tres tablas), así que no se pierde nada. El ELO del club no se toca: se
-- calcula desde los emparejamientos con resultado, y este no tiene ninguno.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

begin;

create temp table a_borrar on commit drop as
  select t.id, t.nombre
  from public.club_tournaments t
  where lower(trim(t.nombre)) = 'test interno'
    -- Guardas: sin inscritos y sin rondas. Si alguna salta, no es el de prueba.
    and not exists (
      select 1 from public.club_tournament_players p where p.tournament_id = t.id
    )
    and not exists (select 1 from public.club_rounds r where r.tournament_id = t.id);

-- Qué se va a borrar, para verlo antes de que pase.
select 'torneos internos a borrar (esperado 1)' as comprobacion, count(*)::text as valor
  from a_borrar
union all
select 'nombres', coalesce(string_agg(nombre, ', '), '(ninguno)') from a_borrar;

delete from public.club_tournaments where id in (select id from a_borrar);

commit;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'torneos internos que quedan (esperado 0)' as comprobacion, count(*)::text as valor
  from public.club_tournaments
union all
select 'partidas del repositorio (no se tocan)', count(*)::text from public.games;
