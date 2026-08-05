-- Onboarding del club: acceso restringido por código y cierre de la lectura a
-- las cuentas todavía no vinculadas a una ficha.
--
-- Spec: docs/superpowers/specs/2026-08-05-onboarding-club-design.md
--
-- GATE USUARIO: como 0001-0008, copiar al SQL Editor de Supabase y ejecutar a
-- mano. Además hay un segundo gate en el dashboard que ESTA migración no puede
-- hacer y sin el cual el gate de registro no sirve de nada:
--   Authentication -> Sign In / Providers -> Email -> desactivar
--   "Allow new users to sign up".
-- Motivo: la clave anónima está por definición en el navegador, así que
-- cualquiera puede llamar a POST /auth/v1/signup y saltarse el formulario de
-- la app. Validar el código solo en la server action es cosmético; el cierre
-- real es ese interruptor. Las cuentas pasan a crearse desde el servidor con
-- `auth.admin.createUser` (clave de servicio), que es la vía exenta.

-- ---------------------------------------------------------------------------
-- 1. Códigos de acceso al club
-- ---------------------------------------------------------------------------
-- El código se guarda EN CLARO a propósito: el admin tiene que poder leerlo
-- para repartirlo por el grupo del club. Es un secreto de valor bajo, vida
-- corta y rotable; la RLS de abajo lo restringe a admin y nunca se sirve al
-- navegador (solo lo lee el servidor con la clave de servicio).
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  activo boolean not null default true,
  usos int not null default 0,
  max_usos int,                      -- null = sin tope
  notas text,
  created_at timestamptz not null default now()
);

-- Solo puede haber un código activo a la vez: evita el lío de tener dos
-- circulando por WhatsApp sin saber cuál es el bueno. El idioma habitual para
-- esto es indexar la propia columna con predicado parcial: todas las filas del
-- índice tienen `activo = true`, así que la unicidad deja pasar solo una.
create unique index if not exists access_codes_uno_activo
  on public.access_codes (activo) where activo;

-- Freno anti-fuerza-bruta. No es la defensa principal (esa es la entropía del
-- código: ~60 bits), solo evita que se pueda martillear el endpoint gratis.
create table if not exists public.registro_intentos (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists registro_intentos_ip_fecha
  on public.registro_intentos (ip, created_at desc);

alter table public.access_codes enable row level security;
alter table public.registro_intentos enable row level security;

-- access_codes: SOLO admin, y solo a través del cliente de usuario. La
-- validación durante el registro la hace el servidor con la clave de servicio
-- (que salta RLS), porque en ese momento el visitante aún no está autenticado.
drop policy if exists "access_codes solo admin" on public.access_codes;
create policy "access_codes solo admin" on public.access_codes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- registro_intentos: nadie. Ni admin. Es una tabla interna del servidor y no
-- hay ninguna pantalla que la lea; sin políticas, RLS lo deniega todo y solo
-- la clave de servicio puede escribir en ella.

-- Código inicial para poder arrancar el onboarding sin pasar por /admin.
-- Se guarda sin guiones; la app normaliza la entrada del usuario para que
-- "cdrl-85c3-cap6" y "CDRL85C3CAP6" sean lo mismo (se puede dictar por teléfono).
-- Idempotente y respetuoso con el índice de arriba: si ya hay un código activo
-- (p. ej. porque se regeneró desde /admin y esta migración se reejecuta), no
-- hace nada en vez de fallar.
insert into public.access_codes (codigo, notas)
select 'CDRL85C3CAP6', 'Código inicial sembrado con la migración 0009'
where not exists (select 1 from public.access_codes where activo);

-- Incremento atómico del contador de usos. Hace falta como función porque
-- leer-sumar-escribir desde la aplicación perdería usos si dos socios se
-- registran a la vez, algo normal cuando el código se reparte por WhatsApp.
-- `revoke` + `grant` a service_role: solo el servidor la puede llamar, no un
-- usuario autenticado desde el navegador.
create or replace function public.incrementar_uso_codigo(codigo_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.access_codes set usos = usos + 1 where id = codigo_id;
$$;

revoke all on function public.incrementar_uso_codigo(uuid) from public, anon, authenticated;
grant execute on function public.incrementar_uso_codigo(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. ¿Está esta cuenta vinculada a una ficha?
-- ---------------------------------------------------------------------------
-- security definer para que la función pueda leer `profiles` sin quedar
-- atrapada en la propia RLS de `profiles`, igual que `is_admin()` (0001).
create or replace function public.esta_vinculado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and player_id is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Cerrar la lectura a las cuentas sin ficha aprobada
-- ---------------------------------------------------------------------------
-- Antes de esta migración, TODAS estas policies eran `using (true)` para
-- cualquier autenticado: una cuenta recién creada, sin que el admin aprobase
-- nada, ya leía los 46 nombres reales de los socios con sus ELOs, el
-- calendario, las convocatorias publicadas y los resultados.
--
-- Se mantiene `or public.is_admin()` en todas para que un admin sin ficha
-- propia siga pudiendo administrar el club.
--
-- Se usa `alter policy` en vez de drop+create para no dejar ni un instante
-- la tabla sin política de lectura.
alter policy "players legibles por autenticados" on public.players
  using (public.esta_vinculado() or public.is_admin());

alter policy "force_order legible" on public.force_order
  using (public.esta_vinculado() or public.is_admin());

alter policy "seasons legibles" on public.seasons
  using (public.esta_vinculado() or public.is_admin());

alter policy "teams legibles" on public.teams
  using (public.esta_vinculado() or public.is_admin());

alter policy "capitanes legibles" on public.team_captains
  using (public.esta_vinculado() or public.is_admin());

alter policy "matches legibles" on public.matches
  using (public.esta_vinculado() or public.is_admin());

alter policy "standings legibles" on public.standings
  using (public.esta_vinculado() or public.is_admin());

alter policy "resultados legibles" on public.board_results
  using (public.esta_vinculado() or public.is_admin());

-- lineups y lineup_boards: la condición original ya distinguía publicada /
-- borrador / capitán. Solo se le añade el requisito de estar vinculado a la
-- rama pública ("publicada"); las ramas de admin y capitán se dejan intactas
-- porque un capitán está vinculado por definición.
alter policy "lineups publicadas legibles" on public.lineups
  using (
    (estado = 'publicada' and public.esta_vinculado())
    or public.is_admin()
    or public.es_capitan_de_match(match_id)
  );

alter policy "boards siguen a su lineup" on public.lineup_boards
  using (exists (
    select 1 from public.lineups l where l.id = lineup_id
      and (
        (l.estado = 'publicada' and public.esta_vinculado())
        or public.is_admin()
        or public.es_capitan_de_match(l.match_id)
      )
  ));

-- `availability` NO se toca: su lectura ya estaba restringida al propio
-- jugador, al capitán del equipo y al admin, y todos ellos están vinculados
-- por definición (la policy compara contra `profiles.player_id`).

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'codigo activo' as comprobacion, codigo as valor
  from public.access_codes where activo
union all
select 'esta_vinculado() existe',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'esta_vinculado'
       ) then 'si' else 'NO - REVISAR' end
union all
select 'policies endurecidas (esperado 10)',
       count(*)::text
  from pg_policies
  where schemaname = 'public'
    and qual like '%esta_vinculado%';
