-- Base de datos de partidas del club (Fase 3).
--
-- Cada socio sube las suyas con sus datos, y **la base es compartida**: todos
-- pueden ver las de todos y buscar por nombre. Cada uno escribe solo las suyas.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  -- De quién es la partida. Todo lo demás (color, resultado, elo) se guarda
  -- DESDE SU PUNTO DE VISTA: `resultado = '1'` significa que ganó él.
  player_id uuid not null references public.players(id) on delete cascade,

  -- Torneo. Enlazado si está en la app (y así la partida aparece en la ficha del
  -- torneo), o en texto libre si no: mucha gente juega cosas que no salen en el
  -- calendario de la FACV, y obligar a crear el torneo antes de guardar una
  -- partida sería la forma más rápida de que nadie subiera ninguna.
  tournament_id uuid references public.tournaments(id) on delete set null,
  torneo_texto text,

  fecha date not null,
  ronda int check (ronda is null or ronda > 0),

  -- El rival casi nunca es del club, así que el nombre es texto libre y manda.
  -- `rival_id` solo se rellena en las partidas entre socios, para poder cruzar
  -- luego los enfrentamientos internos.
  rival_nombre text not null,
  rival_id uuid references public.players(id) on delete set null,
  rival_elo int check (rival_elo is null or (rival_elo between 0 and 3500)),
  mi_elo int check (mi_elo is null or (mi_elo between 0 and 3500)),

  color text not null check (color in ('blancas', 'negras')),
  -- Desde el punto de vista del dueño de la partida. Mismo vocabulario que
  -- `board_results` de la migración 0005, donde ya se guardan 1 / 0.5 / 0.
  resultado text not null check (resultado in ('1', '0.5', '0')),

  apertura text,
  -- Los comentarios del jugador sobre la partida.
  notas text,
  -- Opcional, como decidió la spec original: los datos siempre, el PGN si lo
  -- tiene. Obligarlo dejaría fuera todas las partidas de tablero sin registrar.
  pgn text,

  created_at timestamptz not null default now(),

  -- El rival no puede ser uno mismo.
  check (rival_id is null or rival_id <> player_id)
);

create index if not exists games_por_jugador on public.games (player_id, fecha desc);
create index if not exists games_por_fecha on public.games (fecha desc);
create index if not exists games_por_torneo on public.games (tournament_id);
create index if not exists games_por_rival on public.games (rival_id);

-- Nota sobre la búsqueda por nombre: se hace con `ilike '%texto%'`, que no puede
-- aprovechar un índice btree y hace recorrido completo. A escala de club (miles
-- de partidas como mucho) es instantáneo. Si algún día molesta, la solución es
-- `pg_trgm` con un índice GIN, no cambiar la consulta.

alter table public.games enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: lectura compartida, escritura solo de lo tuyo
-- ---------------------------------------------------------------------------
-- La base es del club: cualquier socio vinculado ve todas las partidas. Es el
-- objetivo del módulo —poder buscar cómo juega un rival al que te enfrentas el
-- sábado— y no tendría sentido con las partidas escondidas.
drop policy if exists "partidas legibles por socios" on public.games;
create policy "partidas legibles por socios" on public.games
  for select to authenticated
  using (public.esta_vinculado() or public.is_admin());

-- Pero cada uno solo escribe las suyas. Ni añadir partidas en nombre de otro ni
-- editar las de nadie: son su registro personal.
drop policy if exists "partidas propias escribe" on public.games;
create policy "partidas propias escribe" on public.games
  for all to authenticated
  using (player_id = public.mi_ficha() or public.is_admin())
  with check (player_id = public.mi_ficha() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tabla creada' as comprobacion,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'games'
       ) then 'si' else 'NO - REVISAR' end as valor
union all
select 'policies (esperado 2)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'games'
union all
select 'indices (esperado 4 + la clave primaria)', count(*)::text
  from pg_indexes where schemaname = 'public' and tablename = 'games'
union all
select 'partidas guardadas', count(*)::text from public.games;
