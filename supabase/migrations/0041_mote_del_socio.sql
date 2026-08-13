-- El mote del club: cómo se llama a cada socio de verdad.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0040.
-- No lleva nada que rellenar.
--
-- QUÉ RESUELVE (pedido por un socio el 2026-08-13, a través del propietario): la lista
-- de socios enseña el nombre tal y como lo publica la FACV —"Almiñana Almiñana,
-- Joaquim"— y en el club a esa persona la llaman Ximo. Con 46 nombres oficiales
-- seguidos, reconocer a alguien cuesta más de lo que debería.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO TOCAR `nombre`: `players.nombre` es el nombre OFICIAL
-- de la FACV y es LA CLAVE CON LA QUE SE CRUZAN LAS 248 FILAS DE ACTA (ver
-- `src/lib/import/cruzar-nombres.ts`). Escribir el mote encima dejaría a ese socio sin
-- cruzar en la siguiente sincronización, y en silencio: sus partidas simplemente
-- dejarían de aparecer.
--
-- Y NO ES `alias`, que ya existe (migración 0035) y se parece: `alias` son palabras
-- EXTRA para el cruce de nombres (el acta pone "Joaquim" donde la ficha pone "Ximo") y
-- no se enseña nunca. `apodo` es lo contrario: no se cruza con nada, solo se enseña.
-- Las dos columnas hacen falta y no se pueden fusionar.

alter table public.players
  add column if not exists apodo text;

-- Ni cadenas vacías ni motes de novela: una cadena vacía haría que la app enseñara un
-- hueco donde debería ir un nombre, y el tope es el ancho de una fila de tabla.
alter table public.players
  drop constraint if exists players_apodo_razonable;
alter table public.players
  add constraint players_apodo_razonable
  check (apodo is null or (length(btrim(apodo)) between 2 and 40));

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna apodo (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.players'::regclass
    and attname = 'apodo' and attnum > 0 and not attisdropped
union all
select 'check del apodo (esperado 1)', count(*)::text
  from pg_constraint where conname = 'players_apodo_razonable'
union all
select 'motes puestos ahora (esperado 0)', count(*)::text
  from public.players where apodo is not null;
