-- Una ficha de pruebas para que el propietario pueda ver la app como la ve un socio.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0039.
-- No lleva nada que rellenar. Después hay un paso manual: registrarse con el segundo
-- correo y avisar para enlazar la cuenta a esta ficha (ver el final del fichero).
--
-- POR QUÉ UNA FICHA DE SOCIO Y NO UNA SEGUNDA CUENTA DE ADMIN (decisión del
-- propietario, 2026-08-12, tras plantearlo al revés): una cuenta de admin NO sirve
-- para ver la app como la ve un miembro. `is_admin()` aparece en las policies de media
-- base —incluida la de partidas privadas de la 0039—, así que con ella se ven cosas
-- que un socio normal no ve, y la prueba diría que todo está bien justo cuando no lo
-- está. Para probar lo que ve un socio hace falta un socio.
--
-- QUÉ SIGNIFICA "DE PRUEBA": que no cuenta como socio del club. No sale en las
-- plantillas de los equipos ni en los números del panel de uso, y su cuenta no deja
-- latido —si no, ensuciaría las visitas y el "% del club" que se acaban de dejar
-- honestos en la 0036—. SÍ sale donde hace falta para poder probar: la lista de retos
-- y los inscritos de un torneo interno. Sin eso no se podría retar a la ficha ni
-- meterla en un torneo, que es justo para lo que existe.
--
-- No hace falta esconderla de la lista de vincular ni de la de ELO: las dos salen de
-- `force_order`, y una ficha creada a mano no tiene fila ahí.

alter table public.players
  add column if not exists de_prueba boolean not null default false;

-- Nombre explícito a propósito. Aparece en la lista de retos y en los inscritos de un
-- torneo, así que cualquier socio que la vea tiene que entender de un vistazo que no
-- es una persona. Un nombre inventado y creíble sería peor: parecería un socio nuevo.
insert into public.players (nombre, activo, de_prueba)
select 'Cuenta de pruebas', true, true
where not exists (select 1 from public.players where de_prueba);

-- ---------------------------------------------------------------------------
-- El latido no cuenta para las cuentas de prueba
-- ---------------------------------------------------------------------------
-- Se sale ANTES de tocar nada (ver la 0036 para el resto de la función, que no
-- cambia): así no hay fila en `uso_socios_dia` ni suma en `uso_diario`, y el panel
-- sigue midiendo el club de verdad.
create or replace function public.registrar_uso(p_profile uuid, p_visita boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ventana constant interval := interval '5 hours';
  v_ultima timestamptz;
  v_cuenta boolean := false;
begin
  if exists (
    select 1
      from profiles pf
      join players pl on pl.id = pf.player_id
      where pf.id = p_profile and pl.de_prueba
  ) then
    return;
  end if;

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
        ultima_visita = case
          when v_cuenta then now()
          else uso_socios_dia.ultima_visita
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
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna de_prueba (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.players'::regclass
    and attname = 'de_prueba' and attnum > 0 and not attisdropped
union all
select 'ficha de pruebas (esperado 1)', count(*)::text
  from public.players where de_prueba
union all
select 'registrar_uso salta las de prueba',
       case when pg_get_functiondef(oid) like '%de_prueba%' then 'si' else 'NO - REVISAR' end
  from pg_proc where proname = 'registrar_uso'
union all
select 'socios de verdad (esperado 46)', count(*)::text
  from public.players where activo and not de_prueba;

-- ---------------------------------------------------------------------------
-- Lo que falta, y es manual
-- ---------------------------------------------------------------------------
-- 1. Registrarse en la app con el segundo correo (la cuenta la crea el propietario;
--    aquí no se tocan contraseñas).
-- 2. Enlazar esa cuenta a esta ficha. NO se puede hacer desde `/club/vincular`: esa
--    lista sale de `force_order` y esta ficha no está ahí, que es justo lo que la
--    mantiene fuera de las listas del club. Se enlaza a mano:
--
--    update public.profiles
--       set player_id = (select id from public.players where de_prueba limit 1)
--     where email = 'EL-SEGUNDO-CORREO';
