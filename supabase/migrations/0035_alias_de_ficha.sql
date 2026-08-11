-- Alias en la ficha, para el cruce de nombres con las actas.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0034. APLICARLA ANTES DE DESPLEGAR: el
-- código nuevo pide esta columna al sincronizar actas.
--
-- POR QUÉ: hay socios cuya ficha va con su nombre de uso ("Ximo") y chess-results
-- publica el de pila ("Joaquim"). Ningún arreglo de cadenas cruza eso: sus
-- partidas del acta quedaban sin enlazar a su ficha. El alias son palabras EXTRA
-- que el cruce (src/lib/import/cruzar-nombres.ts) trata como propias del nombre;
-- no se enseña en ninguna pantalla.
alter table public.players
  add column if not exists alias text;

-- El caso real que lo motivó (acta: "Alminana Alminana, Joaquim").
update public.players
  set alias = 'Joaquim'
  where nombre = 'Ximo Almiñana Almiñana' and alias is null;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columna alias (esperado 1)' as comprobacion, count(*)::text as valor
  from information_schema.columns
  where table_schema = 'public' and table_name = 'players' and column_name = 'alias'
union all
select 'alias de Ximo (esperado 1)', count(*)::text
  from public.players where alias = 'Joaquim';
