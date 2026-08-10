-- Esquema de avisos (notificaciones) y preferencias de silencio por grupo.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0027.

-- ---------------------------------------------------------------------------
-- Tabla de avisos: bandeja del socio.
-- ---------------------------------------------------------------------------
--
-- QUÉ ES: cada acción importante en el club (reto aceptado, alta de socio,
-- fichas nuevas del orden de fuerza) genera una fila aquí. El servidor escribe
-- con clave de servicio; el socio solo ve las suyas y puede marcar "leído".
-- El estado del push (`push`, `push_intentos`) es únicamente para el
-- reintento del cron: el servidor intenta mandar una notificación web VAPID,
-- y si la suscripción del navegador es inválida o el navegador rechaza, pone
-- 'fallido' para reintentarlo UNA SOLA VEZ (spec). Si falla dos veces
-- seguidas, el problema no es pasajero, y el aviso está en la bandeja igual,
-- así que insistir solo gastaría cuota.
--
-- La bandeja NO filtra por grupo: si alguien tiene silenciados los retos, el
-- aviso no se difunde por push, pero la fila existe. El cliente que abre la
-- bandeja filtra por qué grupos tiene silenciados y no los muestra (eso es
-- opcional; si alguien cambia de opinión, la fila sigue ahí).
--
-- COLUMNAS:
-- - `grupo`: categoría del aviso, valores fijos. Se filtra al decidir si
--   mandar push. Cuatro son suficientes para la app; si añade uno nuevo no
--   hace falta migración, solo cambiar el check y rellenar el default.
-- - `tipo`: el motivo exacto ('reto_aceptado', 'alta_aprobada', etc).
--   No va en check (la app los define) y sirve para que el cliente pinte
--   iconos y textos distintos según qué pasó.
-- - `push`: estado de la entrega. 'pendiente' = sin intentar; 'entregado' =
--   al menos un dispositivo lo recibió; 'fallido' = ningún dispositivo lo
--   recibió pero alguno fue un fallo reintentable (no una suscripción muerta);
--   'no_tocaba' = no se intentó porque el socio no tiene suscripción o el grupo
--   está silenciado, O se intentó pero todos los dispositivos fueron suscripciones
--   muertas (404/410). En todos los casos, no hay que reintentar.
-- - `push_intentos`: contador de REINTENTOS hechos por el cron (no intentos
--   totales). Se deja en 0 en el primer envío (`avisar()` en enviar.ts) y
--   solo sube si un reintento vuelve a fallar (`reintentar.ts`). El cron
--   reintenta si `push_intentos < 1`, es decir, una sola vez.
--
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  grupo text not null check (grupo in ('interclubs', 'torneos', 'partidas', 'gestion')),
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  url text,
  creado_en timestamptz not null default now(),
  leido_en timestamptz,
  push text not null default 'pendiente'
    check (push in ('pendiente', 'entregado', 'fallido', 'no_tocaba')),
  push_intentos int not null default 0
);

-- La bandeja se lee siempre igual: los míos, los más nuevos primero.
create index notifications_bandeja on public.notifications (profile_id, creado_en desc);
-- El reintento del cron busca solo fallidos, que son pocos: índice parcial.
create index notifications_a_reintentar on public.notifications (push) where push = 'fallido';

-- ---------------------------------------------------------------------------
-- Preferencias de silencio por grupo.
-- ---------------------------------------------------------------------------
--
-- QUÉ ES: columna en `profiles` que enumera qué grupos de avisos el socio
-- tiene silenciados. Array y no cuatro columnas booleanas: (a) añadir un grupo
-- nuevo no obliga a migración, solo cambiar el check de la tabla principal;
-- (b) el default (array vacío) es lo que queremos — quien no toca nada recibe
-- lo de siempre.
--
-- ESCRITURA: `profiles` tiene una sola policy de update (`"perfil escribe admin"`,
-- 0001) que exige `is_admin()`. Un socio normal NO puede escribir ninguna
-- columna de su fila, incluida esta. Guardar `avisos_silenciados` se hace
-- desde una server action que comprueba la sesión y escribe con `service_role`
-- — el patrón de todas las acciones de la app (20 acciones hoy, todas comprueban
-- identidad antes de escribir). No se abre policy nueva aquí: una policy de
-- update limitada a una columna necesitaría un trigger que bloquee las demás,
-- más superficie de ataque para algo que la action ya resuelve.
--
alter table public.profiles
  add column if not exists avisos_silenciados text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- ---------------------------------------------------------------------------
--
-- QUÉ CIERRA: el acceso a la bandeja de avisos. No hay mucho que cerrar (solo
-- lectura y "marcar leído"), pero se cierra igual: un `select` sin RLS sería
-- una vía para que la API pública sacara el nombre de los socios (los avisos
-- tienen profile_id) sin estar autenticado.
--
alter table public.notifications enable row level security;

-- Cada uno ve los suyos; el admin todos (para diagnosticar "a mí no me llegó nada").
-- CUALIFICAR SIEMPRE: `notifications.profile_id`, no `profile_id` a secas —
-- el bug de la 0024 fue un `p.player_id = player_id` dentro de un `exists`,
-- donde `player_id` sin cualificar se resolvía contra la subconsulta, no la
-- tabla exterior. Aquí no hay subconsulta, pero el patrón es la costumbre.
create policy "avisos: leo los mios" on public.notifications
  for select to authenticated
  using (notifications.profile_id = auth.uid() or public.is_admin());

-- Marcar leído es lo ÚNICO que puede hacer el socio, y solo sobre los suyos.
-- El `with check` repite la condición para que no pueda reasignarse un aviso a otro.
create policy "avisos: marco leidos los mios" on public.notifications
  for update to authenticated
  using (notifications.profile_id = auth.uid())
  with check (notifications.profile_id = auth.uid());

-- NO hay policy de INSERT ni DELETE a propósito: los avisos los escribe el servidor
-- con clave de servicio. Sin esto, un socio podría fabricarse un aviso (o fabricárselo
-- a otro), que es exactamente el agujero que se cerró en el chat en la 0027.

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tabla notifications creada' as comprobacion, count(*)::text as valor
  from information_schema.tables
  where table_schema = 'public' and table_name = 'notifications'
union all
select 'columna avisos_silenciados añadida', count(*)::text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = 'avisos_silenciados'
union all
select 'policies de avisos creadas (esperado 2)', count(*)::text
  from pg_policies
  where schemaname = 'public' and tablename = 'notifications'
    and policyname in ('avisos: leo los mios', 'avisos: marco leidos los mios');
