-- Torneos internos del club y ELO propio (Fase 4).
--
-- Torneos que organiza el club para sus socios, con emparejamientos automáticos
-- (liguilla o suizo), rondas, resultados y clasificación. Las partidas de estos
-- torneos son las únicas que cuentan para el ELO interno.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

-- ---------------------------------------------------------------------------
-- 1. El torneo
-- ---------------------------------------------------------------------------
create table if not exists public.club_tournaments (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sistema text not null check (sistema in ('liguilla', 'suizo')),
  -- En liguilla lo determina el número de inscritos, así que se guarda al
  -- generar el calendario; en suizo lo decide el organizador.
  rondas_totales int check (rondas_totales is null or rondas_totales > 0),
  estado text not null default 'inscripcion'
    check (estado in ('inscripcion', 'en_curso', 'terminado')),
  fecha_inicio date,
  notas text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists club_tournaments_estado
  on public.club_tournaments (estado, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Inscritos
-- ---------------------------------------------------------------------------
create table if not exists public.club_tournament_players (
  tournament_id uuid not null references public.club_tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  -- Foto del ELO al inscribirse: el ELO de club se recalcula siempre desde las
  -- partidas, pero guardar de dónde partía cada uno hace que el torneo sea
  -- reproducible y explicable meses después.
  elo_inicial int not null,
  created_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 3. Rondas y emparejamientos
-- ---------------------------------------------------------------------------
create table if not exists public.club_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.club_tournaments(id) on delete cascade,
  numero int not null check (numero > 0),
  -- Quién descansa esta ronda (número impar de jugadores). Puntúa medio punto,
  -- como unas tablas: regla del club. Los puntos NO se guardan aquí, los calcula
  -- `src/lib/club/clasificacion.ts`, así que cambiar la regla no exige migración.
  descansa_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tournament_id, numero)
);

create table if not exists public.club_pairings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.club_rounds(id) on delete cascade,
  mesa int not null check (mesa > 0),
  blancas_id uuid not null references public.players(id) on delete cascade,
  negras_id uuid not null references public.players(id) on delete cascade,
  -- null mientras no se haya jugado. Desde el punto de vista de las BLANCAS,
  -- mismo criterio que `board_results` de la migración 0005.
  resultado text check (resultado is null or resultado in ('1', '0.5', '0')),
  -- Enlace opcional a la partida del repositorio, para que el socio pueda subir
  -- las jugadas y queden asociadas al torneo.
  game_id uuid references public.games(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (round_id, mesa),
  check (blancas_id <> negras_id)
);

create index if not exists club_pairings_por_ronda on public.club_pairings (round_id);
create index if not exists club_pairings_por_jugador
  on public.club_pairings (blancas_id, negras_id);

-- Nadie puede aparecer dos veces en la misma ronda. No se puede expresar con un
-- único índice porque un jugador puede estar en la columna de blancas o en la de
-- negras, así que lo comprueba un trigger.
create or replace function public.blindar_emparejamiento_interno()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  repetido uuid;
begin
  select p.blancas_id into repetido
    from public.club_pairings p
    where p.round_id = new.round_id
      and (p.id is distinct from new.id)
      and (p.blancas_id in (new.blancas_id, new.negras_id)
        or p.negras_id in (new.blancas_id, new.negras_id))
    limit 1;

  if repetido is not null then
    raise exception 'Uno de los dos jugadores ya tiene partida en esta ronda.';
  end if;

  return new;
end;
$$;

drop trigger if exists blindaje_emparejamiento_interno on public.club_pairings;
create trigger blindaje_emparejamiento_interno
  before insert or update on public.club_pairings
  for each row execute function public.blindar_emparejamiento_interno();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Lectura para cualquier socio vinculado: el torneo y su clasificación son del
-- club. Escritura solo para junta y admin, que son quienes lo organizan.
--
-- El ELO interno NO se guarda en ninguna tabla: se recalcula desde los
-- emparejamientos con resultado cada vez que hace falta. Es la decisión del
-- módulo `src/lib/club/elo.ts` y evita que una corrección de un resultado
-- antiguo deje el ranking mal para siempre.
alter table public.club_tournaments enable row level security;
alter table public.club_tournament_players enable row level security;
alter table public.club_rounds enable row level security;
alter table public.club_pairings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['club_tournaments', 'club_tournament_players', 'club_rounds', 'club_pairings']
  loop
    execute format('drop policy if exists "interno legible" on public.%I', t);
    execute format(
      'create policy "interno legible" on public.%I for select to authenticated using (public.esta_vinculado() or public.is_admin())',
      t
    );
    execute format('drop policy if exists "interno gestiona junta" on public.%I', t);
    execute format(
      'create policy "interno gestiona junta" on public.%I for all to authenticated using (public.es_junta()) with check (public.es_junta())',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tablas nuevas (esperado 4)' as comprobacion, count(*)::text as valor
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('club_tournaments', 'club_tournament_players', 'club_rounds', 'club_pairings')
union all
select 'policies (esperado 8: 2 por tabla)', count(*)::text
  from pg_policies
  where schemaname = 'public'
    and tablename in ('club_tournaments', 'club_tournament_players', 'club_rounds', 'club_pairings')
union all
select 'trigger de nadie dos veces por ronda',
       case when exists (
         select 1 from pg_trigger where tgname = 'blindaje_emparejamiento_interno'
       ) then 'si' else 'NO - REVISAR' end
union all
select 'torneos internos ahora', count(*)::text from public.club_tournaments;
