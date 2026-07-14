-- Equipos de una temporada (A/B/C) con la configuración reglamentaria de su liga
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  nombre text not null,                    -- "Fomento de Gandia", "... B", "... C"
  categoria text not null,                 -- "1ª Autonómica Sur", etc.
  margen_elo int,                          -- RGC 52.3: 100 (Div. Honor), 200 (autonómicas), null = sin margen
  num_tableros int not null default 8,
  created_at timestamptz not null default now(),
  unique (season_id, nombre)
);

-- Capitanes: rol por equipo (el player gana permisos de gestión de SU equipo)
create table public.team_captains (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (team_id, player_id)
);

-- Jornadas (encuentros) de un equipo
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  ronda int not null,
  fecha_hora timestamptz,
  rival text not null,
  es_local boolean not null default true,
  sede text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'jugado')),
  unique (team_id, ronda)
);

-- Disponibilidad jugador × jornada
create table public.availability (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  estado text not null check (estado in ('disponible', 'no_disponible', 'duda')),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- ELO oficial FACV del orden de fuerza (fuente del validador en 1C)
alter table public.force_order add column elo_oficial int;

-- ¿Es el usuario actual capitán de este equipo?
create or replace function public.es_capitan_de(equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.team_captains tc
    join public.profiles p on p.player_id = tc.player_id
    where p.id = auth.uid() and tc.team_id = equipo
  );
$$;

-- RLS
alter table public.teams enable row level security;
alter table public.team_captains enable row level security;
alter table public.matches enable row level security;
alter table public.availability enable row level security;

create policy "teams legibles" on public.teams
  for select to authenticated using (true);
create policy "teams escribe admin" on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "capitanes legibles" on public.team_captains
  for select to authenticated using (true);
create policy "capitanes escribe admin" on public.team_captains
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "matches legibles" on public.matches
  for select to authenticated using (true);
create policy "matches escribe admin" on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "matches edita capitan" on public.matches
  for update to authenticated
  using (public.es_capitan_de(team_id)) with check (public.es_capitan_de(team_id));

-- Disponibilidad: el jugador escribe SOLO la suya (vía su profile); lectura para
-- el propio jugador, capitanes del equipo de la jornada y admin
create policy "disponibilidad propia escribe" on public.availability
  for all to authenticated
  using (player_id = (select player_id from public.profiles where id = auth.uid()))
  with check (player_id = (select player_id from public.profiles where id = auth.uid()));
create policy "disponibilidad lee capitan o admin" on public.availability
  for select to authenticated
  using (
    public.is_admin()
    or player_id = (select player_id from public.profiles where id = auth.uid())
    or public.es_capitan_de((select team_id from public.matches m where m.id = match_id))
  );
