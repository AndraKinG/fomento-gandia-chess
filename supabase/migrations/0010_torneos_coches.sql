-- Fase 2 — Torneos y coches.
--
-- Spec: docs/superpowers/specs/2026-08-05-fase-2-torneos-coches-design.md
-- Plan: docs/superpowers/plans/2026-08-05-fase-2-torneos-coches.md
--
-- GATE USUARIO: como 0001-0009, copiar al SQL Editor de Supabase y ejecutar a
-- mano. No hay nada que tocar en el dashboard esta vez.
--
-- Las reglas de negocio viven en `src/lib/torneos/coches.ts` (módulo puro con
-- 33 tests). Aquí abajo se repiten TRES de ellas como triggers, y no por
-- duplicar: son las que la aplicación no puede garantizar sola porque dependen
-- de lo que hagan otras peticiones a la vez.

-- ---------------------------------------------------------------------------
-- 1. Torneos
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha_inicio date not null,
  -- La FACV manda siempre la de fin, igual a la de inicio si es de un día, así
  -- que no hace falta interpretar ningún null: "es de un día" es inicio = fin.
  fecha_fin date not null,
  lugar text,
  organizador text,
  -- Lo que NO se puede importar: el calendario oficial de la FACV no tiene
  -- página de detalle por torneo. Esto lo rellena el admin a mano.
  hora text,
  ritmo text,
  info_extra text,
  url_bases text,
  -- Interruptor del admin: "a este vamos como club". Sin él, los 168 torneos
  -- que la FACV publica al año enterrarían los tres o cuatro que interesan.
  de_interes boolean not null default false,
  origen text not null default 'manual' check (origen in ('facv', 'manual')),
  -- Clave de deduplicación del re-sync: la tabla de la FACV no expone ningún
  -- id, así que se usa el nombre normalizado + la fecha de inicio.
  clave_facv text unique,
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index if not exists tournaments_fecha on public.tournaments (fecha_inicio desc);
create index if not exists tournaments_interes
  on public.tournaments (fecha_inicio) where de_interes;

-- ---------------------------------------------------------------------------
-- 2. ¿Quién va?
-- ---------------------------------------------------------------------------
-- Mismo vocabulario que `availability` (voy/no_voy/duda, sin fila = sin
-- responder) para que el socio reconozca el gesto y se reutilice el mismo
-- componente de botones.
create table if not exists public.tournament_attendance (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  estado text not null check (estado in ('voy', 'no_voy', 'duda')),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 3. Coches
-- ---------------------------------------------------------------------------
create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  -- Exactamente uno de los dos. La spec original dice que los coches aplican
  -- también a las jornadas de Interclubs fuera de casa, así que el modelo lo
  -- soporta desde el principio para no migrar después; en la Fase 2 la interfaz
  -- solo conecta el camino de torneos.
  --
  -- Dos nullables con check en vez de un par `evento_tipo`/`evento_id`
  -- polimórfico: el polimórfico renuncia a la integridad referencial, y una
  -- tabla `events` genérica obligaría a refactorizar `matches`.
  tournament_id uuid references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  conductor_id uuid not null references public.players(id) on delete cascade,
  -- Plazas PARA PASAJEROS: el conductor no ocupa una de las suyas.
  plazas int not null check (plazas > 0),
  hora_salida text,
  punto_salida text,
  notas text,
  created_at timestamptz not null default now(),
  check ((tournament_id is not null) <> (match_id is not null))
);

create index if not exists cars_torneo on public.cars (tournament_id);
create index if not exists cars_jornada on public.cars (match_id);

create table if not exists public.car_seats (
  car_id uuid not null references public.cars(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  -- DESNORMALIZACIÓN DELIBERADA. La regla "nadie en dos coches del mismo
  -- torneo" no se puede expresar con un índice único sobre (car_id, player_id):
  -- la unicidad tiene que ser por TORNEO, y un torneo abarca varios coches.
  -- Copiando aquí el evento del coche, la regla pasa a ser un índice único y la
  -- garantiza el motor en vez de la confianza. El trigger de abajo rellena
  -- estas dos columnas y prohíbe que el cliente las ponga a su antojo.
  tournament_id uuid references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (car_id, player_id)
);

create unique index if not exists car_seats_uno_por_torneo
  on public.car_seats (tournament_id, player_id) where tournament_id is not null;
create unique index if not exists car_seats_uno_por_jornada
  on public.car_seats (match_id, player_id) where match_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Trigger de asientos: capacidad y desnormalización
-- ---------------------------------------------------------------------------
-- POR QUÉ NO BASTA COMPROBARLO EN LA SERVER ACTION:
-- entre el `select` de plazas libres y el `insert` cabe otra petición, y dos
-- socios apuntándose a la vez a la última plaza pasarían los dos.
--
-- Y POR QUÉ NO BASTA UN `count(*)` DENTRO DEL TRIGGER:
-- en READ COMMITTED, la fila que otra transacción acaba de insertar y aún no ha
-- confirmado NO la ve este count. Las dos transacciones contarían N-1 y las dos
-- insertarían. De ahí el `for update` sobre la fila del coche: la segunda
-- transacción espera a que la primera confirme y entonces cuenta de verdad.
-- Serializa por coche, que es exactamente el grano que hace falta.
create or replace function public.blindar_asientos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  coche public.cars;
  ocupadas int;
begin
  select * into coche from public.cars where id = new.car_id for update;
  if not found then
    raise exception 'El coche no existe.';
  end if;

  -- El evento SIEMPRE se copia del coche, ignorando lo que mande el cliente:
  -- si pudiera elegirlo, podría saltarse el índice único de "un coche por
  -- torneo" declarándose en otro evento.
  new.tournament_id := coche.tournament_id;
  new.match_id := coche.match_id;

  if new.player_id = coche.conductor_id then
    raise exception 'El conductor no ocupa plaza de pasajero en su propio coche.';
  end if;

  select count(*) into ocupadas from public.car_seats where car_id = new.car_id;
  if ocupadas >= coche.plazas then
    raise exception 'Este coche ya está completo (% plazas).', coche.plazas;
  end if;

  return new;
end;
$$;

drop trigger if exists blindaje_asientos on public.car_seats;
create trigger blindaje_asientos
  before insert on public.car_seats
  for each row execute function public.blindar_asientos();

-- ---------------------------------------------------------------------------
-- 5. Trigger de coches: plazas y evento inmutable
-- ---------------------------------------------------------------------------
create or replace function public.blindar_coche()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ocupadas int;
begin
  -- Cambiar el evento del coche dejaría el `tournament_id` copiado en
  -- `car_seats` apuntando al torneo viejo, y con él el índice único que
  -- garantiza "un solo coche por torneo". Se prohíbe en vez de intentar
  -- propagarlo.
  if new.tournament_id is distinct from old.tournament_id
     or new.match_id is distinct from old.match_id then
    raise exception 'Un coche no puede cambiar de torneo o de jornada. Bórralo y crea otro.';
  end if;

  if new.plazas < old.plazas then
    select count(*) into ocupadas from public.car_seats where car_id = old.id;
    if new.plazas < ocupadas then
      raise exception 'Ya llevas % pasajeros: no puedes dejar el coche en % plazas.',
        ocupadas, new.plazas;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists blindaje_coche on public.cars;
create trigger blindaje_coche
  before update on public.cars
  for each row execute function public.blindar_coche();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table public.tournaments enable row level security;
alter table public.tournament_attendance enable row level security;
alter table public.cars enable row level security;
alter table public.car_seats enable row level security;

-- Helper: la ficha del usuario de la sesión. Se repite en varias policies y
-- como subconsulta es más legible que copiar el select entero cada vez.
create or replace function public.mi_ficha()
returns uuid language sql stable security definer set search_path = public as $$
  select player_id from public.profiles where id = auth.uid();
$$;

-- Lectura: para vinculados, coherente con la migración 0009. Quién va y quién
-- lleva coche lo ve todo el club: es un viaje en grupo, la transparencia es el
-- punto.
create policy "torneos legibles" on public.tournaments
  for select to authenticated using (public.esta_vinculado() or public.is_admin());
create policy "torneos escribe admin" on public.tournaments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "asistencia torneo legible" on public.tournament_attendance
  for select to authenticated using (public.esta_vinculado() or public.is_admin());
-- Cada socio solo su propia asistencia (misma forma que la policy de
-- `availability` en la migración 0004).
create policy "asistencia torneo propia" on public.tournament_attendance
  for all to authenticated
  using (player_id = public.mi_ficha())
  with check (player_id = public.mi_ficha());

create policy "coches legibles" on public.cars
  for select to authenticated using (public.esta_vinculado() or public.is_admin());
-- Un coche lo gestiona su conductor. El admin también, para arreglar líos.
create policy "coche gestiona su conductor" on public.cars
  for all to authenticated
  using (conductor_id = public.mi_ficha() or public.is_admin())
  with check (conductor_id = public.mi_ficha() or public.is_admin());

create policy "asientos legibles" on public.car_seats
  for select to authenticated using (public.esta_vinculado() or public.is_admin());
-- Solo puedes ocupar TU plaza. Nadie apunta a nadie.
create policy "asiento propio ocupa" on public.car_seats
  for insert to authenticated with check (player_id = public.mi_ficha());
-- Puedes bajarte tú; el conductor puede bajar a un pasajero de SU coche; el
-- admin, de cualquiera.
create policy "asiento libera interesado" on public.car_seats
  for delete to authenticated
  using (
    player_id = public.mi_ficha()
    or public.is_admin()
    or exists (
      select 1 from public.cars c
      where c.id = car_id and c.conductor_id = public.mi_ficha()
    )
  );

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tablas nuevas (esperado 4)' as comprobacion, count(*)::text as valor
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('tournaments', 'tournament_attendance', 'cars', 'car_seats')
union all
select 'triggers de blindaje (esperado 2)', count(*)::text
  from pg_trigger
  where tgname in ('blindaje_asientos', 'blindaje_coche')
union all
select 'policies nuevas (esperado 9)', count(*)::text
  from pg_policies
  where schemaname = 'public'
    and tablename in ('tournaments', 'tournament_attendance', 'cars', 'car_seats')
union all
select 'indices unicos de un-coche-por-evento (esperado 2)', count(*)::text
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('car_seats_uno_por_torneo', 'car_seats_uno_por_jornada')
union all
select 'funcion mi_ficha()', case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mi_ficha'
  ) then 'si' else 'NO - REVISAR' end;
