-- Quién creó un torneo a mano, para que pueda borrarlo si se equivocó.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano, como 0001-0037.
-- Esta no lleva nada que rellenar.
--
-- QUÉ RESUELVE (pedido por el propietario el 2026-08-11, después de crear un torneo
-- de prueba que hubo que borrar desde un script): un torneo creado a mano no se podía
-- deshacer desde donde se crea. Borrarlo existía solo en el panel de admin, escondido
-- dentro del formulario de editar, y solo para admin — un miembro de la junta que se
-- equivocaba al crearlo tenía que pedírselo a otro.
--
-- LOS TORNEOS INTERNOS YA SABÍAN QUIÉN LOS CREÓ (`club_tournaments.creado_por`, de la
-- 0015); a esta tabla —la del calendario de la FACV, donde también se pueden crear
-- torneos a mano— le faltaba. Sin este dato, "que lo borre quien lo creó" no se puede
-- ni comprobar.
--
-- `on delete set null`, igual que en la 0015: si algún día se borra la cuenta de quien
-- lo creó, el torneo se queda (es del club, no suyo) y lo que se pierde es solo el
-- permiso de borrarlo, que pasa a ser cosa de admin.

alter table public.tournaments
  add column if not exists creado_por uuid references public.profiles(id) on delete set null;

-- NO SE RELLENA HACIA ATRÁS a propósito: las 147 filas que hay son importaciones del
-- calendario de la FACV, que no las ha creado ninguna persona y no se borran nunca
-- (la sincronización las volvería a traer). Las que queden a null solo las puede
-- borrar un admin, que es exactamente lo que se quiere.

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna creado_por (esperado 1)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.tournaments'::regclass
    and attname = 'creado_por'
    and attnum > 0 and not attisdropped
union all
select 'torneos a mano ahora (esperado 0)', count(*)::text
  from public.tournaments where origen = 'manual';
