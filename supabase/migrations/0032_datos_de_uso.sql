-- Datos de uso para el panel de admin: qué se registra y, sobre todo, qué NO.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0031.

-- ---------------------------------------------------------------------------
-- La decisión de privacidad, que aquí es LA decisión.
-- ---------------------------------------------------------------------------
--
-- Esto es un club de 46 personas que se conocen: "quién entró, a qué hora y
-- cuánto rato" son datos de gente identificable, y un panel de uso no los
-- necesita. Se guardan DOS cosas y nada más:
--
--   1. `uso_diario`: contadores AGREGADOS por día — visitas (entradas a la app)
--      y latidos (señales de 5 min con la pestaña delante). De aquí salen el
--      tiempo de uso total (latidos × 5 min) y la media de conectados
--      (latidos / 288 franjas del día). Sin nombres.
--   2. `uso_socios_dia`: (día, cuenta), UNA fila por día como mucho. Es lo
--      mínimo imprescindible para contar "socios activos" sin duplicar, y lo
--      único nominal: dice "entró el martes", no a qué hora ni cuántas veces
--      ni qué miró.
--
-- Lo demás que enseña el panel (partidas, retos, chat, avisos) NO se registra
-- aquí: ya existe en sus tablas con su fecha, y se agrega al consultarlo.
--
create table public.uso_diario (
  dia date primary key,
  visitas int not null default 0,
  latidos int not null default 0
);

create table public.uso_socios_dia (
  dia date not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (dia, profile_id)
);

-- Solo el admin lee; NADIE escribe por RLS (sin policies de escritura, como
-- live_games y notifications): escribe únicamente la función de abajo, llamada
-- desde una server action con clave de servicio.
alter table public.uso_diario enable row level security;
alter table public.uso_socios_dia enable row level security;

create policy "uso: lee el admin" on public.uso_diario
  for select to authenticated using (public.is_admin());
create policy "uso socios: lee el admin" on public.uso_socios_dia
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Registrar un latido, atómico.
-- ---------------------------------------------------------------------------
--
-- FUNCIÓN Y NO DOS UPDATES: el incremento tiene que ser atómico (dos latidos a
-- la vez con upsert de PostgREST se pisarían) y así hay un solo camino de
-- escritura. `security definer` para poder escribir sin policies; el EXECUTE se
-- revoca a todo el mundo salvo service_role, para que ningún cliente pueda
-- inflar los números llamándola por REST.
create or replace function public.registrar_uso(p_profile uuid, p_visita boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into uso_diario (dia, visitas, latidos)
  values (current_date, case when p_visita then 1 else 0 end, 1)
  on conflict (dia) do update
    set visitas = uso_diario.visitas + (case when p_visita then 1 else 0 end),
        latidos = uso_diario.latidos + 1;

  insert into uso_socios_dia (dia, profile_id)
  values (current_date, p_profile)
  on conflict do nothing;
end;
$$;

-- OJO: revocar a `public` quita también la concesión implícita que tenía
-- service_role, así que hay que devolvérsela explícitamente — sin esa línea el
-- servidor tampoco podría llamarla y el latido moriría en silencio.
revoke all on function public.registrar_uso(uuid, boolean) from public;
revoke all on function public.registrar_uso(uuid, boolean) from anon;
revoke all on function public.registrar_uso(uuid, boolean) from authenticated;
grant execute on function public.registrar_uso(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- El recuento de actividad por día, para el panel.
-- ---------------------------------------------------------------------------
--
-- EN SQL Y NO EN LA APP a propósito: PostgREST corta las respuestas en 1000
-- filas, así que traerse los timestamps y contar en el servidor de Next
-- funcionaría hasta el mes en que el chat pase de mil mensajes — y a partir de
-- ahí contaría MENOS en silencio. Un GROUP BY aquí no tiene ese techo.
-- Mismo trato que registrar_uso: solo la clave de servicio puede llamarla.
create or replace function public.recuento_uso(desde date)
returns table (
  dia date,
  partidas_vivo bigint,
  retos bigint,
  partidas_subidas bigint,
  mensajes_chat bigint,
  avisos bigint,
  push_entregados bigint
) language sql security definer set search_path = public as $$
  with dias as (
    select generate_series(desde, current_date, interval '1 day')::date as dia
  )
  select
    d.dia,
    (select count(*) from live_games g where g.creada_en::date = d.dia),
    (select count(*) from challenges c where c.creado_en::date = d.dia),
    (select count(*) from games p where p.created_at::date = d.dia),
    (select count(*) from live_chat m where m.creado_en::date = d.dia),
    (select count(*) from notifications n where n.creado_en::date = d.dia),
    (select count(*) from notifications n
      where n.creado_en::date = d.dia and n.push = 'entregado')
  from dias d
  order by d.dia;
$$;

revoke all on function public.recuento_uso(date) from public;
revoke all on function public.recuento_uso(date) from anon;
revoke all on function public.recuento_uso(date) from authenticated;
grant execute on function public.recuento_uso(date) to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tablas de uso (esperado 2)' as comprobacion, count(*)::text as valor
  from information_schema.tables
  where table_schema = 'public' and table_name in ('uso_diario', 'uso_socios_dia')
union all
select 'funciones de uso (esperado 2)', count(*)::text
  from pg_proc where proname in ('registrar_uso', 'recuento_uso')
union all
select 'policies de uso (esperado 2)', count(*)::text
  from pg_policies where schemaname = 'public'
    and tablename in ('uso_diario', 'uso_socios_dia');
