-- Limpieza de las fichas que no son de socios y del torneo de prueba.
--
-- Pedido por el propietario el 2026-08-06. Son los restos de haber probado los
-- importadores de ELO y un torneo creado a mano para ver cómo iba.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.
--
-- Comprobado antes de escribir esto, vía REST con service_role: ninguna de las
-- cuatro fichas aparece en partidas (ni como dueña ni como rival), asistencias a
-- torneos, coches, asientos, inscripciones a torneos internos, capitanías,
-- perfiles vinculados, solicitudes de vinculación, disponibilidad ni tableros de
-- convocatoria. Cero dependencias en las once tablas que podrían tenerlas, así
-- que este borrado no arrastra ningún dato real.
--
-- Los DELETE llevan doble condición (id + nombre): si algún id no coincidiera con
-- lo esperado, la sentencia borra 0 filas en vez de borrar la fila equivocada.

begin;

-- ---------------------------------------------------------------------------
-- 1. Fichas que no son de socios del club
-- ---------------------------------------------------------------------------
-- Ninguna de las cuatro está en el orden de fuerza, que es el censo real del
-- club: por eso no aparecían en la pantalla de vinculación ni contaban para la
-- fuerza. Salían solo en listados que leen `players` en crudo, como el admin.
delete from public.players
where id = 'eeae0deb-e17e-4f10-9c4f-691d1518b4d9' and nombre = 'Carlsen, Magnus';

delete from public.players
where id = '08e9d3ac-7102-4f40-ba3a-109f5fe0d5f5' and nombre = 'Nakamura, Hikaru';

-- Estas dos son personas reales de la FEDA, pero no socias del club: entraron al
-- probar el importador de la lista oficial.
delete from public.players
where id = 'f512ab0b-a345-4823-98f3-3fa8e2050eab' and nombre = 'Aalbersberg Kroon, Pedro';

delete from public.players
where id = '757b0df7-c4a3-489d-9bb2-2ab016365f36' and nombre = 'Aalders, Hendricus';

-- ---------------------------------------------------------------------------
-- 2. Torneo de prueba
-- ---------------------------------------------------------------------------
-- Creado a mano el 2026-08-06 y marcado de interés, así que salía en la lista del
-- club. Sin asistencias, coches ni partidas colgando.
delete from public.tournaments
where id = 'af169b4d-a802-4ab5-804f-607f221485a6'
  and nombre = 'test'
  and origen = 'manual';

commit;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'jugadores (esperado 46, = orden de fuerza)' as comprobacion,
       count(*)::text as valor
  from public.players
union all
select 'jugadores FUERA del orden de fuerza (esperado 0)', count(*)::text
  from public.players p
  where not exists (
    select 1 from public.force_order f where f.player_id = p.id
  )
union all
select 'torneos creados a mano (esperado 0)', count(*)::text
  from public.tournaments where origen = 'manual'
union all
select 'torneos del calendario FACV (no se tocan)', count(*)::text
  from public.tournaments where origen = 'facv';
