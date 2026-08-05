-- Modelo de rangos del club.
--
-- Decidido por el propietario el 2026-08-05 (ver §4 de
-- docs/superpowers/specs/2026-08-05-arquitectura-objetivo.md):
--
--   Cuatro roles: jugador, capitan, junta, admin. Una persona puede tener
--   varios. LOS PERMISOS SE SUMAN: si alguno de tus roles te permite algo,
--   puedes; si ninguno, no. Cuando uno dice si y otro no, gana el si.
--
-- Eso encaja con Postgres sin pelearse: las policies permisivas de RLS ya se
-- combinan con OR entre ellas, asi que "si algun rol te lo permite, puedes" es
-- literalmente como funciona el motor. Se escribe una policy por rol que pueda
-- hacer algo y la precedencia sale sola.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.
--
-- ESTA MIGRACIÓN NO ROMPE NADA. `profiles.is_admin` sigue existiendo y
-- funcionando: `is_admin()` pasa a devolver true si lo dice la columna vieja O
-- la tabla nueva. Así el código desplegado hoy sigue igual antes y después, y la
-- migración a roles se puede hacer poco a poco.

-- ---------------------------------------------------------------------------
-- 1. Roles globales
-- ---------------------------------------------------------------------------
-- `capitan` NO vive aquí: es un rol POR EQUIPO y ya tiene su tabla
-- (`team_captains`, migración 0004). Meterlo en una tabla plana de roles
-- globales perdería el alcance y un capitán del B podría gestionar el A.
create table if not exists public.member_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rol text not null check (rol in ('jugador', 'junta', 'admin')),
  otorgado_at timestamptz not null default now(),
  primary key (profile_id, rol)
);

create index if not exists member_roles_por_rol on public.member_roles (rol);

alter table public.member_roles enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
/*
 * OJO AL `security definer`, NO ES DECORATIVO. Sin él esto es una recursión
 * infinita: `is_admin()` (abajo) llama a `tiene_rol()`, que lee `member_roles`,
 * cuya policy de lectura llama a `is_admin()`, que llama a `tiene_rol()`…
 *
 * `security definer` hace que la función corra con los permisos de su dueño y se
 * salte la RLS de `member_roles`, así que la policy no se evalúa dentro y el
 * ciclo no existe. Es el mismo motivo por el que `is_admin()` ya era definer
 * desde la migración 0001 para leer `profiles`.
 */
create or replace function public.tiene_rol(rol_buscado text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_roles
    where profile_id = auth.uid() and rol = rol_buscado
  );
$$;

/*
 * is_admin() redefinido para aceptar las DOS fuentes.
 *
 * La original (migración 0001) solo miraba `profiles.is_admin`, y la usan las
 * policies de casi todas las tablas. Redefinirla aquí es lo que hace que la
 * migración sea indolora: en el momento en que se ejecuta, todas esas policies
 * empiezan a entender el rol nuevo sin tocar ni una de ellas.
 */
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()), false
  ) or public.tiene_rol('admin');
$$;

/** La junta (presidente y directivos): validará las solicitudes de ingreso. */
create or replace function public.es_junta()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_rol('junta') or public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS de la propia tabla de roles
-- ---------------------------------------------------------------------------
-- Cada uno ve sus roles; el admin los ve todos. Solo el admin reparte rangos:
-- si la junta pudiera, podría nombrarse admin a sí misma y el reparto de poder
-- dejaría de significar nada.
drop policy if exists "roles: ver los propios o admin" on public.member_roles;
create policy "roles: ver los propios o admin" on public.member_roles
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "roles: reparte admin" on public.member_roles;
create policy "roles: reparte admin" on public.member_roles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Traspaso de lo que ya existe
-- ---------------------------------------------------------------------------
-- Quien ya era admin por la columna, ahora también lo es por rol.
insert into public.member_roles (profile_id, rol)
select id, 'admin' from public.profiles where is_admin
on conflict do nothing;

-- Y todo el que tiene ficha vinculada es jugador.
insert into public.member_roles (profile_id, rol)
select id, 'jugador' from public.profiles where player_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'roles repartidos' as comprobacion, count(*)::text as valor
  from public.member_roles
union all
select 'admins por rol', count(*)::text
  from public.member_roles where rol = 'admin'
union all
select 'jugadores por rol', count(*)::text
  from public.member_roles where rol = 'jugador'
union all
select 'is_admin() sigue existiendo con las dos fuentes',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'is_admin'
           and pg_get_functiondef(p.oid) like '%tiene_rol%'
       ) then 'si' else 'NO - REVISAR' end
union all
select 'helpers nuevos (esperado 2: tiene_rol, es_junta)', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('tiene_rol', 'es_junta');
