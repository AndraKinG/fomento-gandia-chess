-- La policy de UPDATE de `notifications` (0028) dejaba libres TODAS las columnas.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0028.
--
-- QUÉ CIERRA: es el MISMO patrón que la 0027 (A2) cerró en `matches` — una policy
-- que solo mira DE QUIÉN es la fila deja al dueño tocar CUALQUIER columna. La
-- policy "avisos: marco leidos los mios" existe para una sola cosa (poner
-- `leido_en`), pero por REST un socio podía reescribir en sus propios avisos:
--
--  (1) `titulo`/`cuerpo`/`url`: la bandeja se vende como el registro fiable de lo
--      que la app le dijo a cada uno ("a mí no me llegó nada" se diagnostica
--      mirándola, y el admin la ve entera para eso). Si el socio puede reescribir
--      el texto, ese registro no prueba nada.
--  (2) `push` y `push_intentos`: ponerse `push = 'fallido'` con `push_intentos = 0`
--      apunta el aviso al barrido diario del cron (`reintentar.ts` busca
--      exactamente eso) y hace que la app le repita el push cada día. Gasta cuota
--      del servicio de push y convierte el contador de "un solo reintento" en papel
--      mojado.
--  (3) `grupo`/`tipo`/`creado_en`: reordenar o recategorizar el histórico.
--
-- El daño es solo sobre las filas PROPIAS —la policy sí impide tocar las de
-- otro—, por eso esto es un blindaje y no un incendio. Pero la promesa de la
-- bandeja ("lo que hay aquí es lo que pasó") vale lo que valga este candado.
--
-- CÓMO: trigger, igual que `blindar_matches`. No se puede hacer solo con la
-- policy: `with check` ve la fila NUEVA pero no puede compararla con la vieja,
-- así que no distingue "marca leído" de "reescribe el título". El trigger sí.
--
-- QUÉ SE PERMITE: cambiar `leido_en`, nada más. En las dos direcciones (marcar y
-- desmarcar): hoy la app solo marca, pero si algún día hay "marcar como no
-- leído" no debe estrellarse contra esto. El servidor (clave de servicio) pasa
-- de largo, como en todos los blindajes: `avisar()` y el cron actualizan `push`
-- legítimamente por esa vía.
create or replace function public.blindar_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if new.profile_id   is distinct from old.profile_id
     or new.grupo     is distinct from old.grupo
     or new.tipo      is distinct from old.tipo
     or new.titulo    is distinct from old.titulo
     or new.cuerpo    is distinct from old.cuerpo
     or new.url       is distinct from old.url
     or new.creado_en is distinct from old.creado_en
     or new.push      is distinct from old.push
     or new.push_intentos is distinct from old.push_intentos then
    raise exception
      'De un aviso solo se puede marcar leído (leido_en): el resto de la fila es el registro de lo que la app dijo y lo escribe únicamente el servidor.';
  end if;

  return new;
end;
$$;

drop trigger if exists blindaje_notifications on public.notifications;
create trigger blindaje_notifications
  before update on public.notifications
  for each row execute function public.blindar_notifications();

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'trigger de blindaje de avisos creado (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_trigger
  where tgname = 'blindaje_notifications' and not tgisinternal;
