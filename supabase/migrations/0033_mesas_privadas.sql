-- Los canales de las mesas en vivo pasan a ser PRIVADOS.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0032.
--
-- QUÉ CIERRA (hallazgo "Importante — Cualquiera puede escuchar" de la auditoría
-- del 2026-08-10, verificado empíricamente): los canales `partida-<id>` llevan
-- las jugadas Y EL CHAT de cada partida, y eran públicos — cualquiera con la
-- clave pública de la app (está en el navegador de cualquier visitante) y el id
-- de una partida podía escucharlos sin sesión. Escribir no podía alterar nada,
-- pero el chat de dos socios no es para los oídos de fuera.
--
-- CÓMO: un canal privado de Supabase Realtime comprueba, AL UNIRSE, las policies
-- de `realtime.messages`. Estas dos dicen quién puede escuchar (SELECT) y quién
-- puede difundir (INSERT) en los topics `partida-%`: socios vinculados, y el
-- admin aunque no tenga ficha. El servidor difunde con la clave de servicio, que
-- no pasa por aquí.
--
-- QUÉ SE QUEDA PÚBLICO, a propósito:
--  - La presencia (`presencia-club`, `mirando-*`): un punto verde y "quién mira"
--    no cuentan nada que la pantalla no enseñe, y son canales sin datos.
--  - Los avisos (`avisos-<ficha>`): el mensaje es "mira otra vez, hay novedad";
--    el dato de verdad lo consulta el navegador con su sesión y su RLS.
--
create policy "mesas: escuchan los socios"
  on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'partida-%'
    and extension = 'broadcast'
    and (public.esta_vinculado() or public.is_admin())
  );

create policy "mesas: difunden los socios"
  on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'partida-%'
    and extension = 'broadcast'
    and (public.esta_vinculado() or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'policies de mesas privadas (esperado 2)' as comprobacion, count(*)::text as valor
  from pg_policies
  where schemaname = 'realtime' and tablename = 'messages'
    and policyname in ('mesas: escuchan los socios', 'mesas: difunden los socios');
