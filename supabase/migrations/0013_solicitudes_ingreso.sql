-- Solicitudes de ingreso al club desde la web pública.
--
-- Cierra el punto 1 de docs/superpowers/specs/2026-08-05-arquitectura-objetivo.md:
-- la web pública tiene un formulario para quien quiere entrar en el club, la
-- junta lo valida y después se habla del pago.
--
-- OJO A LA DIFERENCIA con el código de acceso (migración 0009), que son dos
-- puertas distintas y las dos hacen falta:
--   - Esto es para quien NO es socio todavía: pide entrar en el club como
--     entidad. Lo valida la junta y el resultado es una persona nueva.
--   - El código de acceso es para quien YA es socio y solo quiere entrar en la
--     app; su ficha ya existe en el orden de fuerza.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text,
  -- Lo que quiera contar: si ha jugado antes, si viene de otro club, horarios...
  mensaje text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada')),
  -- Quién la revisó y cuándo, para saber a quién preguntar meses después.
  revisada_por uuid references public.profiles(id) on delete set null,
  revisada_at timestamptz,
  notas_internas text,
  created_at timestamptz not null default now()
);

create index if not exists membership_requests_pendientes
  on public.membership_requests (created_at desc) where estado = 'pendiente';

-- Una sola solicitud pendiente por email: evita el duplicado accidental de quien
-- pulsa dos veces o vuelve a rellenar el formulario a los diez minutos porque no
-- recibió respuesta. Si se rechaza y vuelve a pedirlo más adelante, puede.
create unique index if not exists membership_requests_un_pendiente_por_email
  on public.membership_requests (lower(email)) where estado = 'pendiente';

alter table public.membership_requests enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: cerrada del todo salvo para quien gestiona socios
-- ---------------------------------------------------------------------------
-- NO hay policy de inserción para `anon`, y es deliberado: el formulario es
-- público, pero la escritura la hace una server action con la clave de servicio
-- después de validar. Abrir un `insert` a `anon` significaría que cualquiera con
-- la clave anónima —que está en el navegador de todo el mundo— puede escribir en
-- esta tabla saltándose la validación y el freno anti-abuso.
--
-- Y tampoco hay lectura para `anon`: son datos personales de gente que ni
-- siquiera es socia todavía.
drop policy if exists "solicitudes: gestiona la junta" on public.membership_requests;
create policy "solicitudes: gestiona la junta" on public.membership_requests
  for all to authenticated
  using (public.es_junta()) with check (public.es_junta());

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tabla creada' as comprobacion,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'membership_requests'
       ) then 'si' else 'NO - REVISAR' end as valor
union all
select 'policies (esperado 1, solo junta)', count(*)::text
  from pg_policies
  where schemaname = 'public' and tablename = 'membership_requests'
union all
select 'indice de un pendiente por email',
       case when exists (
         select 1 from pg_indexes
         where indexname = 'membership_requests_un_pendiente_por_email'
       ) then 'si' else 'NO - REVISAR' end
union all
select 'solicitudes pendientes ahora', count(*)::text
  from public.membership_requests where estado = 'pendiente';
