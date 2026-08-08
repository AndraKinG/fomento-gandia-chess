-- Cadencia de un torneo interno, para poder jugar sus partidas en la app.
--
-- POR QUÉ EN EL TORNEO Y NO EN CADA PARTIDA: en un torneo el ritmo es del torneo,
-- no de cada mesa. Si lo eligiera quien empieza la partida, dos mesas de la misma
-- ronda podrían jugarse a ritmos distintos, y eso no es un torneo.
--
-- Los valores por defecto son un rápidas de club normal (10+5), así que los torneos
-- que ya existen siguen funcionando sin tocarlos.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

alter table public.club_tournaments
  add column if not exists base_min int not null default 10
    check (base_min between 1 and 180),
  add column if not exists incremento_s int not null default 5
    check (incremento_s between 0 and 60);

-- Una partida en vivo por emparejamiento y no más: sin esto, dos toques seguidos al
-- botón de jugar crearían dos partidas de la misma mesa y el resultado que acabara
-- contando sería el de la que se cerrara la última.
create unique index if not exists live_games_un_emparejamiento
  on public.live_games (club_pairing_id)
  where club_pairing_id is not null;
