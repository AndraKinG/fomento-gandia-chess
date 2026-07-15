-- Convocatoria de una jornada (una por match)
create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  publicada_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tableros de la convocatoria (color se calcula al leer: art. 59, no se almacena)
create table public.lineup_boards (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  tablero int not null check (tablero between 1 and 8),
  player_id uuid not null references public.players(id) on delete cascade,
  unique (lineup_id, tablero),
  unique (lineup_id, player_id)
);

-- Resultado por tablero, desde el punto de vista del jugador del club
create table public.board_results (
  lineup_board_id uuid primary key references public.lineup_boards(id) on delete cascade,
  resultado numeric(2,1) not null check (resultado in (1, 0.5, 0)),
  updated_at timestamptz not null default now()
);

-- Clasificación del grupo de cada equipo (sync FACV o edición admin)
create table public.standings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  posicion int not null,
  club text not null,
  puntos numeric(5,1) not null default 0,
  es_nuestro boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (team_id, posicion)
);

-- ¿Es el usuario capitán del equipo de esta jornada?
create or replace function public.es_capitan_de_match(encuentro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_capitan_de((select team_id from public.matches where id = encuentro));
$$;

alter table public.lineups enable row level security;
alter table public.lineup_boards enable row level security;
alter table public.board_results enable row level security;
alter table public.standings enable row level security;

-- lineups: publicadas para todos; borradores solo capitán del equipo o admin
create policy "lineups publicadas legibles" on public.lineups
  for select to authenticated
  using (estado = 'publicada' or public.is_admin() or public.es_capitan_de_match(match_id));
create policy "lineups gestiona capitan" on public.lineups
  for all to authenticated
  using (public.is_admin() or public.es_capitan_de_match(match_id))
  with check (public.is_admin() or public.es_capitan_de_match(match_id));

create policy "boards siguen a su lineup" on public.lineup_boards
  for select to authenticated
  using (exists (
    select 1 from public.lineups l where l.id = lineup_id
      and (l.estado = 'publicada' or public.is_admin() or public.es_capitan_de_match(l.match_id))
  ));
create policy "boards gestiona capitan" on public.lineup_boards
  for all to authenticated
  using (exists (select 1 from public.lineups l where l.id = lineup_id
    and (public.is_admin() or public.es_capitan_de_match(l.match_id))))
  with check (exists (select 1 from public.lineups l where l.id = lineup_id
    and (public.is_admin() or public.es_capitan_de_match(l.match_id))));

create policy "resultados legibles" on public.board_results
  for select to authenticated using (true);
create policy "resultados gestiona capitan" on public.board_results
  for all to authenticated
  using (exists (
    select 1 from public.lineup_boards lb join public.lineups l on l.id = lb.lineup_id
    where lb.id = lineup_board_id and (public.is_admin() or public.es_capitan_de_match(l.match_id))
  ))
  with check (exists (
    select 1 from public.lineup_boards lb join public.lineups l on l.id = lb.lineup_id
    where lb.id = lineup_board_id and (public.is_admin() or public.es_capitan_de_match(l.match_id))
  ));

create policy "standings legibles" on public.standings
  for select to authenticated using (true);
create policy "standings escribe admin" on public.standings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
