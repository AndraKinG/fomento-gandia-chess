-- Partidas que solo ve quien las sube, y partidas favoritas.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0038.
-- No lleva nada que rellenar.
--
-- QUÉ AÑADE (pedido por el propietario el 2026-08-12):
--   1. Un interruptor al subir una partida para que NO salga en el repositorio del
--      club y solo la vea su dueño en "Mías".
--   2. Marcar partidas como favoritas.
--
-- POR QUÉ NO ES SOLO UN FILTRO DE PANTALLA: si `privada` solo lo mirara la consulta,
-- la partida seguiría siendo legible para cualquier socio con la sesión abierta —el
-- cliente de Supabase habla con PostgREST directamente—. La promesa "solo la ves tú"
-- la tiene que sostener la RLS o no vale nada.

alter table public.games
  add column if not exists privada boolean not null default false;

-- Índice parcial: lo normal es que casi ninguna lo sea, y la lista del club pregunta
-- siempre por las que NO lo son.
create index if not exists games_privadas on public.games (player_id) where privada;

-- ---------------------------------------------------------------------------
-- RLS de games: la lectura deja de ser "todo el club, siempre"
-- ---------------------------------------------------------------------------
-- HAY QUE PARTIR LA POLICY DE ESCRITURA, y es el detalle que hace que esto funcione:
-- la de la 0014 era `for all`, y en Postgres `all` INCLUYE el select. Como permitía
-- `is_admin()`, un admin habría seguido viendo las partidas privadas de todos por esa
-- otra puerta —las policies se suman— y "solo la ves tú" habría sido mentira para
-- justo la persona con más acceso. Separada en insert/update/delete, la lectura la
-- decide únicamente la policy de abajo.
--
-- Se mantiene que un admin pueda corregir o borrar la partida de otro (era así desde
-- la 0014 y sirve para limpiar): puede tocarla sin verla, que es raro pero inofensivo,
-- y no puede leerla, que es lo que se prometió.
drop policy if exists "partidas propias escribe" on public.games;

create policy "partidas propias inserta" on public.games
  for insert to authenticated
  with check (player_id = public.mi_ficha() or public.is_admin());

create policy "partidas propias actualiza" on public.games
  for update to authenticated
  using (player_id = public.mi_ficha() or public.is_admin())
  with check (player_id = public.mi_ficha() or public.is_admin());

create policy "partidas propias borra" on public.games
  for delete to authenticated
  using (player_id = public.mi_ficha() or public.is_admin());

-- La lectura: las públicas para todo el club (que es el objetivo del módulo, poder
-- mirar cómo juega el rival del sábado) y las privadas solo para su dueño.
drop policy if exists "partidas legibles por socios" on public.games;
create policy "partidas legibles por socios" on public.games
  for select to authenticated
  using (
    (not privada and (public.esta_vinculado() or public.is_admin()))
    or player_id = public.mi_ficha()
  );

-- ---------------------------------------------------------------------------
-- Favoritas
-- ---------------------------------------------------------------------------
-- POR CUENTA Y NO POR FICHA (`profile_id`, no `player_id`): una favorita es un
-- marcador de quien mira, no un dato de la partida. Se guardan las de OTROS tanto
-- como las propias —"esta partida de Fulano quiero volver a verla"— así que ponerlo
-- como un booleano en `games` habría sido el favorito de una sola persona.
create table if not exists public.game_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, game_id)
);

create index if not exists game_favorites_por_cuenta
  on public.game_favorites (profile_id, created_at desc);

alter table public.game_favorites enable row level security;

-- Cada uno ve y toca SOLO sus marcadores. Nadie tiene por qué saber qué partidas se
-- guarda otro, ni siquiera un admin: no es información del club.
drop policy if exists "favoritas propias" on public.game_favorites;
create policy "favoritas propias" on public.game_favorites
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna privada (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.games'::regclass
    and attname = 'privada' and attnum > 0 and not attisdropped
union all
select 'policies de games (esperado 4)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'games'
union all
select 'tabla game_favorites (esperado 1)', count(*)::text
  from pg_class where relname = 'game_favorites' and relkind = 'r'
union all
select 'policy de favoritas (esperado 1)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'game_favorites'
union all
select 'partidas privadas ahora (esperado 0)', count(*)::text
  from public.games where privada;
