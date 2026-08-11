-- Datos de uso: visitas que no se inflan, y "socios nuevos".
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0035.
--
-- QUÉ ARREGLA (visto por el propietario el 2026-08-12): "visitas" contaba UNA POR
-- CADA VEZ que se montaba la app, así que él solo, recargando para probar cosas,
-- puso 15 visitas en un día. Un número que sube al mirarlo no mide nada.
--
-- LA VENTANA VA EN LA BASE Y NO EN EL NAVEGADOR, y es lo importante de esta
-- migración: en `localStorage` se pierde al limpiar el navegador, no se comparte
-- entre el móvil y el PC del mismo socio, y cualquiera puede borrarlo. Aquí, con
-- la marca de la última visita por socio, la regla se cumple siempre.
--
-- LA PRIVACIDAD NO CAMBIA (ver la 0032): `uso_socios_dia` sigue teniendo una fila
-- por socio y día, sin horas ni pantallas. Lo único nuevo es CUÁNTAS veces entró
-- ese día y cuándo fue la última — el mínimo para no contar de más.

alter table public.uso_socios_dia
  add column if not exists visitas int not null default 0,
  add column if not exists latidos int not null default 0,
  add column if not exists ultima_visita timestamptz;

-- La ventana se mira por socio y CRUZANDO DÍAS (quien entra a las 23:50 y a las
-- 00:10 hizo una visita, no dos), así que se busca por `profile_id` suelto.
create index if not exists uso_socios_ultima_visita
  on public.uso_socios_dia (profile_id, ultima_visita desc);

-- ---------------------------------------------------------------------------
-- registrar_uso, ahora con ventana de visita
-- ---------------------------------------------------------------------------
create or replace function public.registrar_uso(p_profile uuid, p_visita boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  -- CINCO HORAS: lo que pidió el propietario. Es una tarde de club: quien entra
  -- por la mañana y otra vez por la noche son dos visitas de verdad; quien recarga
  -- ocho veces seguidas probando algo, una.
  v_ventana constant interval := interval '5 hours';
  v_ultima timestamptz;
  v_cuenta boolean := false;
begin
  select max(ultima_visita) into v_ultima
    from uso_socios_dia where profile_id = p_profile;

  if p_visita and (v_ultima is null or now() - v_ultima > v_ventana) then
    v_cuenta := true;
  end if;

  insert into uso_socios_dia (dia, profile_id, visitas, latidos, ultima_visita)
  values (
    current_date,
    p_profile,
    case when v_cuenta then 1 else 0 end,
    1,
    case when v_cuenta then now() else null end
  )
  on conflict (dia, profile_id) do update
    set visitas = uso_socios_dia.visitas + (case when v_cuenta then 1 else 0 end),
        latidos = uso_socios_dia.latidos + 1,
        -- `coalesce` y no un `case`: si esta vez no cuenta, se conserva la marca
        -- que hubiera, no se pisa con null.
        ultima_visita = case
          when v_cuenta then now()
          else coalesce(uso_socios_dia.ultima_visita, null)
        end;

  insert into uso_diario (dia, visitas, latidos)
  values (current_date, case when v_cuenta then 1 else 0 end, 1)
  on conflict (dia) do update
    set visitas = uso_diario.visitas + (case when v_cuenta then 1 else 0 end),
        latidos = uso_diario.latidos + 1;
end;
$$;

revoke all on function public.registrar_uso(uuid, boolean) from public;
revoke all on function public.registrar_uso(uuid, boolean) from anon;
revoke all on function public.registrar_uso(uuid, boolean) from authenticated;
grant execute on function public.registrar_uso(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- recuento_uso, ahora con "socios nuevos"
-- ---------------------------------------------------------------------------
--
-- NUEVOS = socios que entran en la app POR PRIMERA VEZ ese día. Es el dato que
-- de verdad dice si la app se está extendiendo por el club, y no se podía sacar
-- del panel anterior. Se calcula con el primer día de cada socio, así que cada
-- socio cuenta como nuevo UNA sola vez en toda la historia — y por eso sumarlo
-- por semanas o meses da el número correcto sin más cuentas.
--
-- Cambia el tipo devuelto, así que hay que tirar la función antes: Postgres no
-- deja cambiarlo con `create or replace`.
drop function if exists public.recuento_uso(date);

create or replace function public.recuento_uso(desde date)
returns table (
  dia date,
  nuevos bigint,
  partidas_vivo bigint,
  retos bigint,
  partidas_subidas bigint,
  mensajes_chat bigint,
  avisos bigint,
  push_entregados bigint
) language sql security definer set search_path = public as $$
  with dias as (
    select generate_series(desde, current_date, interval '1 day')::date as dia
  ),
  primeros as (
    select profile_id, min(dia) as primer_dia from uso_socios_dia group by profile_id
  )
  select
    d.dia,
    (select count(*) from primeros p where p.primer_dia = d.dia),
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
select 'columnas nuevas en uso_socios_dia (esperado 3)' as comprobacion,
       count(*)::text as valor
  from information_schema.columns
  where table_schema = 'public' and table_name = 'uso_socios_dia'
    and column_name in ('visitas', 'latidos', 'ultima_visita')
union all
select 'indice de ultima visita (esperado 1)', count(*)::text
  from pg_indexes
  where schemaname = 'public' and indexname = 'uso_socios_ultima_visita'
union all
select 'recuento_uso devuelve nuevos (esperado 1)', count(*)::text
  from information_schema.routines r
  join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'public' and r.routine_name = 'recuento_uso'
    and p.parameter_name = 'nuevos';
