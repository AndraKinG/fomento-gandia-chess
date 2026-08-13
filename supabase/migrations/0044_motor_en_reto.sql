-- Marca de que una partida se jugó con ayuda del motor.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0043.
-- No lleva nada que rellenar.
--
-- QUÉ ES ESTO (pedido por el propietario el 2026-08-13): quiere poder encender
-- Stockfish en una partida de RETO contra un colega del club para vacilarle un rato, y
-- contárselo después. No es un modo de juego: es una broma, y por eso lo que hace esta
-- migración es sobre todo **dejar constancia**.
--
-- LA MARCA NO SE PUEDE QUITAR, y es lo importante del diseño: se enciende y se queda.
-- Apagar el motor deja de darle jugadas, pero la partida sigue diciendo que se jugó
-- con él. Sin esto, "luego se lo digo" dependería de que se acordara; con esto, la
-- propia partida lo cuenta al acabar, que es lo que convierte esto en un vacile en vez
-- de en otra cosa.
--
-- NUNCA EN TORNEOS, y lo dice la BASE, no la pantalla: un torneo interno tiene
-- clasificación y resultados que cuentan, así que ahí no es una broma. El CHECK lo hace
-- imposible aunque algún día un botón se equivoque; también lo comprueba el servidor.

alter table public.live_games
  add column if not exists motor_ficha uuid references public.players(id) on delete set null;

alter table public.live_games
  drop constraint if exists motor_solo_en_retos;
alter table public.live_games
  add constraint motor_solo_en_retos
  check (motor_ficha is null or origen = 'reto');

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna motor_ficha (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.live_games'::regclass
    and attname = 'motor_ficha' and attnum > 0 and not attisdropped
union all
select 'check de solo retos (esperado 1)', count(*)::text
  from pg_constraint where conname = 'motor_solo_en_retos'
union all
select 'partidas con motor ahora (esperado 0)', count(*)::text
  from public.live_games where motor_ficha is not null;
