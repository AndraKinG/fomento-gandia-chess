-- Blindaje BD de convocatorias (revisión final Fase 1C, item 6).
--
-- Contexto del problema: RLS (migración 0005) ya impide a un capitán tocar
-- `lineups` de OTRO equipo, pero NO impide que el capitán de SU PROPIO
-- equipo salte el validador de servidor (`publicarConvocatoria`,
-- src/app/equipos/[id]/convocatoria/actions.ts) llamando directamente a la
-- REST API de Supabase con su propio JWT (p. ej. un PATCH a
-- `.../lineups?match_id=eq.X` con `estado=publicada`): las policies de RLS
-- solo comprueban "¿es capitán de este match?", nunca CÓMO se llegó al nuevo
-- estado ni si la alineación cumple el RGC. Este trigger cierra esa puerta.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Debe copiarse al
-- SQL Editor de Supabase y ejecutarse a mano (mismo patrón que 0001-0006).
-- El código de la aplicación (`publicarConvocatoria`/`despublicarConvocatoria`,
-- ya actualizados para escribir la transición final con `createAdminClient()`)
-- funciona IGUAL antes y después de aplicar esta migración: antes de
-- aplicarla, el cliente admin ya salta la RLS como siempre; después, además
-- pasa el trigger porque es `service_role`. No hay ninguna dependencia de
-- orden entre "aplicar 0007" y "desplegar el código de la Task de revisión".
--
-- Qué congela el trigger (BEFORE UPDATE OR DELETE en public.lineups):
--  (a) CUALQUIER UPDATE o DELETE sobre una lineup cuyo encuentro (matches)
--      esté en estado 'jugado' — el registro histórico de lo realmente
--      alineado no se toca nunca más, ni por el capitán ni por un bug de UI
--      ni por un DELETE accidental.
--  (b) La transición borrador -> publicada en un UPDATE. Es la ÚNICA
--      transición de estado que el trigger restringe: publicada -> borrador
--      (despublicar) y borrador -> borrador (guardar tableros del borrador,
--      `guardarBorrador` hace un upsert que no cambia el estado) siguen
--      funcionando con RLS normal para cualquier capitán autorizado. Solo
--      "convertirse en la convocatoria oficial publicada" exige haber
--      pasado por el validador completo del servidor.
--
-- Bypass: `current_setting('role', true) = 'service_role'`. PostgREST hace
-- `SET LOCAL ROLE service_role` en cada request autenticado con la clave de
-- servicio (`createAdminClient()`, src/lib/supabase/admin.ts) — el backend
-- de Next.js YA ha corrido el validador completo (núcleo + contexto) ANTES
-- de llamar a la actualización final con ese cliente (ver
-- `publicarConvocatoria`/`despublicarConvocatoria`,
-- src/app/equipos/[id]/convocatoria/actions.ts): el trigger es la ÚLTIMA
-- puerta (defensa en profundidad), no la única.
--
-- Verificado que NO rompe el flujo normal de edición de un borrador: el
-- upsert de `guardarBorrador` sobre `lineups` (`estado: 'borrador'`,
-- `onConflict: match_id`) dispara un UPDATE cuando la fila ya existe, pero
-- `old.estado = new.estado = 'borrador'` no es la transición vigilada (b), y
-- el encuentro normalmente no está 'jugado' en ese punto (la action ya lo
-- comprueba antes); el reemplazo de tableros (`lineup_boards`) ni siquiera
-- toca la fila de `lineups`, así que el trigger (solo en `lineups`) no
-- interviene en absoluto en la edición del borrador tablero a tablero.
create or replace function public.blindar_lineups()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  encuentro_jugado boolean;
begin
  -- El service_role (backend, tras validar) se salta el blindaje por
  -- completo: es la única vía autorizada a publicar/despublicar/tocar una
  -- convocatoria jugada (p. ej. correcciones administrativas puntuales).
  if current_setting('role', true) = 'service_role' then
    return coalesce(new, old);
  end if;

  select (m.estado = 'jugado') into encuentro_jugado
    from public.matches m
    where m.id = old.match_id;

  if encuentro_jugado then
    raise exception
      'El encuentro ya está jugado: la convocatoria es el registro histórico de lo realmente alineado y no se puede modificar ni eliminar directamente.';
  end if;

  if TG_OP = 'UPDATE' and old.estado = 'borrador' and new.estado = 'publicada' then
    raise exception
      'La publicación de una convocatoria debe hacerse a través del validador del servidor (publicarConvocatoria), no con un UPDATE directo.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists blindaje_lineups on public.lineups;
create trigger blindaje_lineups
  before update or delete on public.lineups
  for each row execute function public.blindar_lineups();
