-- Registro de errores de la app, sin servicios de fuera.
--
-- GATE USUARIO: este fichero NO se aplica solo. Copiar al SQL Editor de Supabase y
-- ejecutarlo a mano, como 0001-0051.
--
-- QUÉ SE PIDIÓ Y POR QUÉ (propietario, 2026-10-08): desde el lanzamiento hay socios de
-- verdad usando la app, y la única forma de enterarse de que algo fallaba era que alguien
-- lo dijera por WhatsApp — o buscarlo a mano en los registros de Vercel, que en el plan
-- gratuito solo guardan una hora. Se eligió una solución PROPIA y no Sentry o similar:
-- en el club hay menores (Sub-18) y así ningún dato de los socios sale de su Supabase.
--
-- CÓMO FUNCIONA:
-- - Una fila por FALLO, no por aparición. La `firma` (origen|ruta|mensaje, ya sin ids
--   ni números: `src/lib/errores/firma.ts`) agrupa las repeticiones y `veces` las cuenta.
-- - `registrar_error()` es la ÚNICA puerta de escritura, y solo la puede llamar el
--   servidor (clave de servicio). Devuelve si el fallo es nuevo, para avisar solo
--   entonces.
-- - NO HAY NI QUIÉN NI DESDE DÓNDE: ninguna columna de usuario ni de IP, a propósito.
--
-- TOPES, PORQUE EL ENDPOINT DEL NAVEGADOR ES PÚBLICO (tiene que serlo: también puede
-- fallar el login o la portada, sin sesión). Alguien podría mandar errores inventados
-- sin parar. Con estos topes, lo peor que puede pasar es ruido acotado en esta tabla:
-- - como mucho 30 fallos NUEVOS por hora (las repeticiones solo suman a una fila);
-- - como mucho 1000 filas en total;
-- - los resueltos hace más de 90 días se borran solos al entrar uno nuevo.
-- Van aquí y no en el código porque en Vercel cada petición puede caer en un servidor
-- distinto: un contador en memoria no se comparte entre ellos.
--
-- CÓMO REVERTIRLO: `drop function public.registrar_error(text, text, text, text, text, text, text);`
-- y `drop table public.errores;`. Solo se pierde el propio registro de errores.

create table if not exists public.errores (
  id bigint generated always as identity primary key,
  firma text not null unique,
  origen text not null check (origen in ('servidor', 'navegador')),
  mensaje text not null,
  ruta text not null,
  -- Las primeras líneas de la pila. En los del navegador sale minificada (poco legible),
  -- pero sirve para saber de qué pantalla y componente viene.
  detalle text,
  -- La "Referencia" que ve el socio en la pantalla de error. Si te dice "me sale la
  -- referencia 12345", con esto se encuentra la fila.
  ultimo_digest text,
  -- Solo la familia: "Chrome · Android". Nunca la cabecera entera.
  navegador text,
  veces integer not null default 1,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  resuelto boolean not null default false,
  resuelto_en timestamptz
);

create index if not exists errores_ultima_vez on public.errores (ultima_vez desc);

-- ---------------------------------------------------------------------------
-- RLS: leer, solo admins. Escribir, nadie con sesión: solo el servidor.
-- ---------------------------------------------------------------------------
-- Sin policies de insert/update/delete a propósito (como `notifications` en la 0028):
-- un socio no puede ni fabricar errores ni borrarlos. El servidor escribe con la clave
-- de servicio, que salta RLS; marcar "resuelto" lo hace una acción que comprueba
-- primero que quien lo pide es admin.
alter table public.errores enable row level security;

drop policy if exists "errores: ver admin" on public.errores;
create policy "errores: ver admin" on public.errores
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- registrar_error(): suma o crea, y dice qué ha pasado
-- ---------------------------------------------------------------------------
-- Devuelve:
--   'nuevo'       -> primera vez que se ve: hay que avisar
--   'reaparece'   -> estaba marcado como resuelto y ha vuelto: también se avisa
--   'repetido'    -> ya se conocía y seguía abierto: solo suma
--   'descartado'  -> se ha llegado a un tope: no se guarda
create or replace function public.registrar_error(
  p_firma text,
  p_origen text,
  p_mensaje text,
  p_ruta text,
  p_detalle text,
  p_digest text,
  p_navegador text
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_resuelto boolean;
  v_insertado boolean;
begin
  -- ¿Ya existe? Se bloquea la fila para que dos apariciones a la vez no se pisen al sumar.
  select e.resuelto into v_resuelto
    from public.errores e
   where e.firma = p_firma
   for update;

  if found then
    update public.errores e
       set veces = e.veces + 1,
           ultima_vez = now(),
           -- Se guarda la ÚLTIMA pila y referencia: es la que el socio acaba de ver.
           detalle = coalesce(p_detalle, e.detalle),
           ultimo_digest = coalesce(p_digest, e.ultimo_digest),
           navegador = coalesce(p_navegador, e.navegador),
           resuelto = false,
           resuelto_en = null
     where e.firma = p_firma;
    return case when v_resuelto then 'reaparece' else 'repetido' end;
  end if;

  -- Fallo nuevo: primero los topes.
  if (select count(*) from public.errores e where e.primera_vez > now() - interval '1 hour') >= 30
     or (select count(*) from public.errores) >= 1000 then
    return 'descartado';
  end if;

  delete from public.errores e
   where e.resuelto and e.resuelto_en < now() - interval '90 days';

  -- `on conflict` por si otro servidor ha creado la misma fila entre el `select` de
  -- arriba y este `insert`. `xmax = 0` es la forma de Postgres de decir "esta fila la
  -- acabo de insertar yo" (si no, es que la ha actualizado el `on conflict`).
  insert into public.errores as e
    (firma, origen, mensaje, ruta, detalle, ultimo_digest, navegador)
  values
    (p_firma, p_origen, p_mensaje, p_ruta, p_detalle, p_digest, p_navegador)
  on conflict (firma) do update
    set veces = e.veces + 1, ultima_vez = now()
  returning (xmax = 0) into v_insertado;

  return case when v_insertado then 'nuevo' else 'repetido' end;
end;
$$;

-- Solo el servidor. Sin esto, cualquiera con la clave pública podría llamarla por la API.
revoke all on function public.registrar_error(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_error(text, text, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tabla errores con RLS (esperado true)' as comprobacion,
       relrowsecurity::text as valor
  from pg_class
 where oid = 'public.errores'::regclass
union all
select 'policies de errores (esperado 1)',
       count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'errores'
union all
select 'anon puede llamar a registrar_error (esperado false)',
       has_function_privilege('anon',
         'public.registrar_error(text, text, text, text, text, text, text)', 'execute')::text;
