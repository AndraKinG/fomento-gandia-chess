-- El botón del asistente a gusto de cada uno, y sus preguntas en el panel de uso.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0043.

-- ---------------------------------------------------------------------------
-- 1. Dónde quiere cada socio el botón flotante del asistente
-- ---------------------------------------------------------------------------
--
-- Lo pidió el propietario ("mover botón asistente ia al gusto o ocultarlo"): el botón
-- vive fijo en la esquina de abajo a la derecha de TODA la zona de socios, y ahí tapa
-- lo que haya en esa esquina — en el panel de uso, la última columna de la tabla.
--
-- ES UNA PREFERENCIA DE CUENTA, como el tema del tablero y el juego de piezas
-- (migraciones 0030 y 0031), y por el mismo motivo: viaja con el socio del móvil al PC
-- y no se pierde al limpiar el navegador. Null = el sitio de siempre, así que las 46
-- cuentas siguen viéndolo donde estaba sin tocar nada.
--
-- "oculto" ESCONDE EL BOTÓN, no el asistente: se sigue llegando desde el perfil, que es
-- donde se apaga. Un ajuste que deja algo inalcanzable para siempre es una trampa.
alter table public.profiles
  add column if not exists asistente_boton text
    check (asistente_boton in ('derecha', 'izquierda', 'oculto'));

-- ---------------------------------------------------------------------------
-- 2. Cuántas preguntas se le hacen al asistente
-- ---------------------------------------------------------------------------
--
-- Lo pidió el propietario ("contabilizar conversación ia de usuarios en el panel").
-- Hoy el asistente NO DEJA RASTRO NINGUNO: la conversación vive en la memoria del
-- navegador y se va al recargar (ver Asistente.tsx), así que no había forma de saber si
-- alguien lo usa — y eso decide si la clave de la IA merece la pena.
--
-- LA PRIVACIDAD ES LA MISMA DE LA 0032, y esto no la mueve un milímetro: se guarda UN
-- CONTADOR, "cuántas preguntas", ni el texto de la pregunta ni el de la respuesta ni la
-- hora. Guardar las conversaciones de 46 personas que se conocen para ver una cifra en
-- un panel sería cobrar carísimo por un número.
--
-- VA EN LAS TABLAS QUE YA EXISTEN y no en una nueva: es un contador por día igual que
-- las visitas y los latidos, y el panel ya lee esas dos tablas.
alter table public.uso_diario
  add column if not exists mensajes_ia int not null default 0;
alter table public.uso_socios_dia
  add column if not exists mensajes_ia int not null default 0;

-- Misma forma que `registrar_uso`: atómica, `security definer`, y el EXECUTE revocado a
-- todo el mundo salvo service_role — si un cliente pudiera llamarla, el número del panel
-- lo escribiría cualquiera desde la consola del navegador.
create or replace function public.registrar_asistente(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- LA CUENTA DE PRUEBAS NO ES EL CLUB (migración 0040): probando el asistente con ella
  -- se inflaría justo el número que sirve para decidir si el club lo usa.
  if exists (
    select 1
      from profiles pf
      join players pl on pl.id = pf.player_id
      where pf.id = p_profile and pl.de_prueba
  ) then
    return;
  end if;

  insert into uso_diario (dia, mensajes_ia)
  values (current_date, 1)
  on conflict (dia) do update
    set mensajes_ia = uso_diario.mensajes_ia + 1;

  -- La fila por socio y día ya existe si ha entrado hoy (la crea el latido), pero se
  -- inserta igual: preguntar es entrar, y no depender del orden evita perder la primera
  -- pregunta del día.
  insert into uso_socios_dia (dia, profile_id, mensajes_ia)
  values (current_date, p_profile, 1)
  on conflict (dia, profile_id) do update
    set mensajes_ia = uso_socios_dia.mensajes_ia + 1;
end;
$$;

revoke all on function public.registrar_asistente(uuid) from public;
revoke all on function public.registrar_asistente(uuid) from anon;
revoke all on function public.registrar_asistente(uuid) from authenticated;
grant execute on function public.registrar_asistente(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna asistente_boton (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.profiles'::regclass
    and attname = 'asistente_boton' and attnum > 0 and not attisdropped
union all
select 'columnas mensajes_ia (esperado 2)', count(*)::text
  from pg_attribute
  where attrelid in ('public.uso_diario'::regclass, 'public.uso_socios_dia'::regclass)
    and attname = 'mensajes_ia' and attnum > 0 and not attisdropped
union all
select 'funcion registrar_asistente (esperado 1)', count(*)::text
  from pg_proc where proname = 'registrar_asistente';
