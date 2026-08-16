-- El botón del asistente, arrastrable a donde cada uno quiera.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0044.
--
-- POR QUÉ, si la 0044 ya dejaba elegir esquina: lo pidió el propietario al probarlo
-- ("¿no hay opción de arrastrar el widget al gusto por la pantalla?"). Y tiene razón:
-- dos esquinas son dos sitios, y el botón flota sobre TODAS las pantallas de la zona de
-- socios, donde lo que estorba cambia según la pantalla y según el móvil.
--
-- SE GUARDA EN FRACCIONES DE PANTALLA (0 a 1), NO EN PÍXELES, y esa es la decisión de
-- esta migración: en píxeles, el botón que dejaste a mano derecha en el monitor
-- aparecería fuera de cuadro en el móvil, y girar el teléfono lo mandaría al limbo. En
-- fracciones, "a la altura de un tercio por la derecha" significa lo mismo en las dos.
--
-- NULL = donde diga `asistente_boton` (la esquina de la 0044). Quien no arrastre nada
-- no nota ningún cambio, y elegir una esquina en el perfil vuelve a poner esto a null:
-- así el ajuste de siempre sigue siendo la forma de deshacer un arrastre.
alter table public.profiles
  add column if not exists asistente_x real check (asistente_x between 0 and 1),
  add column if not exists asistente_y real check (asistente_y between 0 and 1);

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columnas de posicion (esperado 2)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.profiles'::regclass
    and attname in ('asistente_x', 'asistente_y')
    and attnum > 0 and not attisdropped;
