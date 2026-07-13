-- Fichas de jugador (existen sin cuenta de usuario)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fide_id text unique,
  feda_id text unique,
  elo_fide int,
  elo_feda int,
  elo_otro int,
  activo boolean not null default true,
  excepcion_tecnificacion boolean not null default false, -- RGC 52.3.d
  excepcion_veterano boolean not null default false,      -- RGC 52.3.e
  created_at timestamptz not null default now()
);

-- Perfil 1:1 con auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  player_id uuid unique references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default false,
  created_at timestamptz not null default now()
);

-- Orden de fuerza por temporada; bis_index 0 = titular N, 1 = N-bis (RGC art. 50)
create table public.force_order (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  numero int not null,
  bis_index int not null default 0,
  unique (season_id, player_id),
  unique (season_id, numero, bis_index) deferrable initially deferred
);

create table public.link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now()
);

-- Perfil automático al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper de rol
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()), false
  );
$$;

-- RLS
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.force_order enable row level security;
alter table public.link_requests enable row level security;

create policy "players legibles por autenticados" on public.players
  for select to authenticated using (true);
create policy "players escribe admin" on public.players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "perfil propio o admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "perfil escribe admin" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "seasons legibles" on public.seasons
  for select to authenticated using (true);
create policy "seasons escribe admin" on public.seasons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "force_order legible" on public.force_order
  for select to authenticated using (true);
create policy "force_order escribe admin" on public.force_order
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "link_requests: crear la propia" on public.link_requests
  for insert to authenticated with check (user_id = auth.uid());
create policy "link_requests: ver propia o admin" on public.link_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "link_requests: gestiona admin" on public.link_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
