-- Perfil del socio: foto, aperturas favoritas y tema del tablero.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0029.

-- ---------------------------------------------------------------------------
-- Dónde vive cada cosa, que aquí es LA decisión.
-- ---------------------------------------------------------------------------
--
-- FOTO Y APERTURAS VAN EN `players`, NO EN `profiles`, y el motivo es la RLS:
-- `profiles` solo lo lee su dueño o el admin (0001), así que cualquier dato
-- guardado ahí es invisible para el resto del club — y la gracia de la foto y
-- las aperturas es justo que LOS DEMÁS las vean en tu ficha de socio. `players`
-- ya lo leen todos los vinculados (0009), que es exactamente el público que
-- queremos. Los escribe su dueño desde una server action con clave de servicio
-- tras comprobar que la ficha es la de su sesión (el patrón de toda la app).
--
-- EL TEMA DEL TABLERO VA EN `profiles`: es un ajuste personal —a nadie le
-- importa de qué color ves tú las casillas— y ahí viaja con la cuenta, el mismo
-- tablero en el móvil y en el ordenador. Sin check en la base: el catálogo de
-- temas vive en el código (src/lib/ajedrez/temas.ts) y una clave desconocida
-- cae al tema del club sin romper nada, así que añadir un tema no pide migración.
--
alter table public.players
  add column if not exists foto_url text,
  add column if not exists aperturas text;

alter table public.profiles
  add column if not exists tema_tablero text not null default 'gandiblues';

-- ---------------------------------------------------------------------------
-- El bucket de fotos.
-- ---------------------------------------------------------------------------
--
-- PRIVADO, no público: son caras de 46 personas identificables, y un bucket
-- público es una URL adivinable sin sesión. La app enseña las fotos con URLs
-- FIRMADAS de una hora que genera el servidor, así que quien no está dentro de
-- la app no ve nada.
--
-- SIN POLICIES DE ESCRITURA a propósito (mismo patrón que `live_games` y
-- `notifications`): sube y borra solo el servidor con clave de servicio, después
-- de comprobar la sesión, el tipo y el tamaño. Una policy de INSERT sobre
-- storage.objects dejaría a cualquier socio llenar el bucket de lo que fuera.
--
-- La lectura autenticada tampoco hace falta como policy: las URLs firmadas las
-- genera el servidor con la clave de servicio, que no pasa por RLS.
--
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columnas de players (esperado 2)' as comprobacion, count(*)::text as valor
  from information_schema.columns
  where table_schema = 'public' and table_name = 'players'
    and column_name in ('foto_url', 'aperturas')
union all
select 'columna tema_tablero (esperado 1)', count(*)::text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = 'tema_tablero'
union all
select 'bucket de fotos (esperado 1)', count(*)::text
  from storage.buckets where id = 'fotos';
