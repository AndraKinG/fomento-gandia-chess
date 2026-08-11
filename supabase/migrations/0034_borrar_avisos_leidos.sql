-- Cada uno puede borrar SUS avisos YA LEÍDOS, para limpiar la bandeja.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0033.
--
-- La 0028 no abrió DELETE a propósito ("los avisos los escribe el servidor"), y
-- eso sigue siendo verdad para INSERT. Pero sin ninguna vía de borrado la bandeja
-- solo crece (petición del propietario, 2026-08-11). Se abre EXACTAMENTE lo
-- mínimo: tus filas, y solo las leídas — un aviso sin leer no se puede borrar,
-- primero se lee (o se marca leído), y así no desaparece nada que no se haya
-- visto. La app borra con el cliente de la SESIÓN: es esta policy la que manda.
create policy "avisos: borro los mios leidos" on public.notifications
  for delete to authenticated
  using (profile_id = auth.uid() and leido_en is not null);

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'policy de borrado (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_policies
  where schemaname = 'public' and tablename = 'notifications'
    and policyname = 'avisos: borro los mios leidos';
