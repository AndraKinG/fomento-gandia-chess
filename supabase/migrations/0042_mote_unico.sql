-- Dos socios no pueden tener el mismo mote.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0041.
-- No lleva nada que rellenar.
--
-- POR QUÉ (visto por el propietario el 2026-08-13, poniendo motes): un mote existe para
-- reconocer a alguien de un vistazo. Dos "Ximo" en la lista de retos no solo no ayudan:
-- estropean el nombre oficial, que al menos era distinto. Un mote repetido es peor que
-- no tener mote.
--
-- SIN MAYÚSCULAS Y SIN ESPACIOS DE MÁS, porque si no la regla se saltaría escribiendo
-- "ximo" o "Ximo ": para reconocer a una persona, esos tres son el mismo mote. El
-- índice va sobre `lower(btrim(apodo))` y por eso es un índice de expresión y no un
-- `unique` de columna.
--
-- LOS NULL NO CHOCAN, que es lo normal en Postgres y lo que hace falta: los 46 socios
-- pueden estar sin mote a la vez.
--
-- OJO CON LOS ACENTOS: "Ximo" y "Xímo" siguen siendo dos motes distintos para este
-- índice. No se normalizan porque quitar acentos en Postgres pide la extensión
-- `unaccent`, y el caso de dos socios con el mismo mote separado solo por una tilde no
-- ha pasado nunca ni es probable en un club de 46. Si algún día pasa, se ve en pantalla.

create unique index if not exists players_apodo_unico
  on public.players (lower(btrim(apodo)))
  where apodo is not null;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'indice de mote único (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_class where relname = 'players_apodo_unico'
union all
select 'motes repetidos ahora (esperado 0)', count(*)::text
  from (
    select lower(btrim(apodo))
      from public.players
      where apodo is not null
      group by lower(btrim(apodo))
      having count(*) > 1
  ) as repetidos;
