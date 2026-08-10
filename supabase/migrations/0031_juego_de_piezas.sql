-- Juego de piezas elegible, el hermano de `tema_tablero` (0030).
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0030.
--
-- En `profiles` porque es un ajuste personal que viaja con la cuenta, y sin
-- check en la base por lo mismo que `tema_tablero`: el catálogo vive en el
-- código (src/lib/ajedrez/piezas.ts) y una clave desconocida cae al juego
-- clásico sin romper nada, así que añadir un juego no pide migración.
alter table public.profiles
  add column if not exists juego_piezas text not null default 'celtic';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna juego_piezas (esperado 1)' as comprobacion, count(*)::text as valor
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = 'juego_piezas';
