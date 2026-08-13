-- Cada socio puede PEDIR su mote; la junta lo aprueba.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0042.
-- No lleva nada que rellenar.
--
-- QUÉ AÑADE (pedido por el propietario el 2026-08-13): hasta ahora el mote solo lo
-- ponía la junta (0041). Lo natural es que cada uno pida el suyo —nadie sabe mejor cómo
-- le llaman— y que la junta dé el visto bueno, porque el mote lo ve el club entero y un
-- campo libre en manos de 46 personas acaba con alguien llamándose algo que no toca.
--
-- UNA COLUMNA Y NO UNA TABLA DE SOLICITUDES: cada socio tiene UNA solicitud viva como
-- mucho —pedir un mote nuevo sustituye al que pidieras antes— así que una tabla con
-- estados solo añadiría filas resueltas que nadie va a leer. Cuando la junta decide, la
-- columna se vacía: el estado ES la presencia del dato.
--
-- POR QUÉ NO HAY ÍNDICE ÚNICO AQUÍ, al contrario que en `apodo` (0042): la regla real
-- es "no choca con ningún mote PUESTO ni PEDIDO", y eso cruza dos columnas, que un
-- índice de una sola no puede expresar. La comprueba `moteOcupado()`
-- (`src/lib/club/mote.ts`, con tests) desde las dos puertas —la solicitud y el campo de
-- la junta— y el índice de `apodo` sigue siendo la última red al aprobar.

alter table public.players
  add column if not exists apodo_solicitado text;

-- El mismo tope que el mote de verdad: si no cabe aprobado, no tiene sentido pedirlo.
alter table public.players
  drop constraint if exists players_apodo_solicitado_razonable;
alter table public.players
  add constraint players_apodo_solicitado_razonable
  check (apodo_solicitado is null or (length(btrim(apodo_solicitado)) between 2 and 40));

-- Índice parcial para la lista de la junta ("qué motes hay por aprobar"): lo normal es
-- que no haya ninguno, así que preguntarlo tiene que ser barato.
create index if not exists players_apodo_solicitado
  on public.players (apodo_solicitado)
  where apodo_solicitado is not null;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna apodo_solicitado (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.players'::regclass
    and attname = 'apodo_solicitado' and attnum > 0 and not attisdropped
union all
select 'check del mote pedido (esperado 1)', count(*)::text
  from pg_constraint where conname = 'players_apodo_solicitado_razonable'
union all
select 'indice de pendientes (esperado 1)', count(*)::text
  from pg_class where relname = 'players_apodo_solicitado'
union all
select 'motes pendientes ahora (esperado 0)', count(*)::text
  from public.players where apodo_solicitado is not null;
