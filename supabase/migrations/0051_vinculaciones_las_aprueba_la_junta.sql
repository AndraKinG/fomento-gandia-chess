-- La junta también aprueba las vinculaciones de cuenta.
--
-- GATE USUARIO: este fichero NO se aplica solo. Copiar al SQL Editor de Supabase y
-- ejecutarlo a mano, como 0001-0050.
--
-- QUÉ SE PIDIÓ Y POR QUÉ (propietario, 2026-09-23): hasta ahora las vinculaciones las
-- aprobaba SOLO el admin, y eso lo convertía en un cuello de botella el día del
-- lanzamiento. Un socio que se registra y elige su ficha se queda en una pantalla de
-- espera y NO PUEDE ENTRAR a la app hasta que alguien le apruebe: con 43 socios por
-- llegar y una sola persona pudiendo aprobar, la mitad se quedaría esperando horas sin
-- entender por qué.
--
-- POR QUÉ HACE FALTA TOCAR LA RLS Y NO BASTA CON EL CÓDIGO: la pantalla LEE las
-- solicitudes con el cliente de la sesión, no con la clave de servicio. La policy de
-- `select` de la 0001 es `user_id = auth.uid() or public.is_admin()`, así que a un socio
-- de la junta la lista le saldría VACÍA — sin error, sin aviso, simplemente sin filas.
-- Habría parecido que no hay nadie esperando.
--
-- `es_junta()` YA INCLUYE AL ADMIN (ver 0011: `tiene_rol('junta') or is_admin()`), así
-- que al admin no se le quita nada.
--
-- LO QUE NO SE ABRE, Y ES A PROPÓSITO: repartir rangos sigue siendo solo del admin
-- (0011). Si la junta pudiera nombrarse admin a sí misma, el reparto de poder dejaría
-- de significar nada. Aprobar una vinculación es decir "sí, este señor es quien dice
-- ser", que es justo el trabajo de la junta; darse permisos es otra cosa.
--
-- CÓMO REVERTIRLO: volver a ejecutar las dos policies de la 0001 con `is_admin()` en
-- lugar de `es_junta()`. No hay pérdida de datos — esto solo cambia quién ve y escribe.

-- ---------------------------------------------------------------------------
-- 1. Ver las solicitudes
-- ---------------------------------------------------------------------------
-- La propia SIEMPRE, que es lo que permite a cada socio ver el estado de la suya
-- mientras espera. Y además, la junta las ve todas.
drop policy if exists "link_requests: ver propia o admin" on public.link_requests;
drop policy if exists "link_requests: ver propia o junta" on public.link_requests;
create policy "link_requests: ver propia o junta" on public.link_requests
  for select to authenticated
  using (user_id = auth.uid() or public.es_junta());

-- ---------------------------------------------------------------------------
-- 2. Resolverlas
-- ---------------------------------------------------------------------------
-- Las acciones del servidor escriben con la clave de servicio (que salta RLS) y
-- comprueban el rango en código, así que esta policy no es la que manda hoy. Se pone
-- igualmente porque la regla de la casa son TRES capas —RLS dura, acción que
-- re-verifica, interfaz que oculta— y dejar la RLS contando algo distinto de lo que
-- hace la app es lo que hace que la siguiente persona que la lea se equivoque.
drop policy if exists "link_requests: gestiona admin" on public.link_requests;
drop policy if exists "link_requests: gestiona junta" on public.link_requests;
create policy "link_requests: gestiona junta" on public.link_requests
  for update to authenticated
  using (public.es_junta()) with check (public.es_junta());

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'policies de link_requests (esperado 3)' as comprobacion,
       count(*)::text as valor
  from pg_policies
 where schemaname = 'public' and tablename = 'link_requests'
union all
select 'ninguna sigue atada solo a is_admin',
       case when count(*) = 0 then 'ok' else 'REVISAR: ' || count(*)::text end
  from pg_policies
 where schemaname = 'public' and tablename = 'link_requests'
   and (qual like '%is_admin%' or with_check like '%is_admin%');
