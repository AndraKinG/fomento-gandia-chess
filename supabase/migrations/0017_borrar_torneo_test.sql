-- Borrar el torneo de prueba "test" que quedaba marcado como de interés.
--
-- Salía en Inicio y en Torneos como si el club fuera a él. El propietario confirmó
-- que es un resto de pruebas.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

begin;

-- Se identifica por nombre exacto Y por origen manual, no solo por el nombre: un
-- torneo real del calendario de la FACV podría llamarse igual algún día, y un
-- `delete` por nombre suelto se lo llevaría por delante. Los de la FACV tienen
-- `origen = 'facv'`.
create temp table a_borrar on commit drop as
  select id, nombre from public.tournaments
  where origen = 'manual' and lower(trim(nombre)) = 'test';

-- Qué se va a borrar, para verlo antes de que pase.
select 'torneos a borrar' as comprobacion, count(*)::text as valor from a_borrar
union all
select 'nombres', coalesce(string_agg(nombre, ', '), '(ninguno)') from a_borrar
union all
select 'asistencias que se van con él', count(*)::text
  from public.tournament_attendance where tournament_id in (select id from a_borrar)
union all
select 'coches que se van con él', count(*)::text
  from public.cars where tournament_id in (select id from a_borrar)
union all
select 'partidas que quedarán sin torneo (se conservan)', count(*)::text
  from public.games where tournament_id in (select id from a_borrar);

-- Asientos y coches primero. `car_seats` cae en cascada con `cars`, y `cars` y
-- `tournament_attendance` caen en cascada con `tournaments`, así que bastaría con
-- borrar el torneo; se hace explícito para que el orden quede a la vista y no
-- dependa de recordar qué tiene `on delete cascade`.
delete from public.car_seats
  where car_id in (select id from public.cars where tournament_id in (select id from a_borrar));
delete from public.cars where tournament_id in (select id from a_borrar);
delete from public.tournament_attendance where tournament_id in (select id from a_borrar);

-- Las partidas del repositorio NO se borran: son de los socios. `games.tournament_id`
-- es `on delete set null` y además cada partida guarda `torneo_texto`, así que se
-- quedan en la base con su nombre escrito.
delete from public.tournaments where id in (select id from a_borrar);

commit;

-- Verificación: no debe quedar ninguno.
select 'torneos manuales llamados test (esperado 0)' as comprobacion,
       count(*)::text as valor
  from public.tournaments
  where origen = 'manual' and lower(trim(nombre)) = 'test'
union all
select 'torneos de interés que quedan', count(*)::text
  from public.tournaments where de_interes;
