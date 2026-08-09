-- Eventos de la partida dentro del chat (decisión del propietario, 2026-08-09).
--
-- PARA QUÉ: que quede escrito quién ofreció tablas, quién pidió volver una jugada y
-- qué contestó el otro. Hasta ahora, si el rival decía que no, la tarjeta
-- desaparecía sin más y no quedaba rastro: parecía que se hubiera perdido el
-- mensaje. Y una negativa es justo lo que hay que ver.
--
-- CÓMO: los eventos son mensajes del chat, pero sin autor. `player_id` pasa a
-- admitir nulo y se añade `evento`, que dice de qué va. La pantalla los pinta
-- distinto —centrados y en gris— para que no se confundan con lo que escribe la
-- gente.
--
-- POR QUÉ EN LA MISMA TABLA Y NO EN OTRA: es la misma conversación y se lee en
-- orden. En una tabla aparte habría que mezclar las dos listas por fecha en cada
-- lectura, y eso es trabajo y una fuente de errores a cambio de nada.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

alter table public.live_chat
  alter column player_id drop not null;

alter table public.live_chat
  add column if not exists evento text;

-- Un mensaje es de alguien o es un evento, pero no ninguna de las dos cosas: sin
-- esto cabría una fila sin autor y sin tipo, que no se sabría cómo pintar.
alter table public.live_chat
  drop constraint if exists live_chat_con_autor_o_evento;
alter table public.live_chat
  add constraint live_chat_con_autor_o_evento
  check (player_id is not null or evento is not null);

-- Los eventos los escribe SIEMPRE el servidor, con la clave de servicio, así que la
-- política de escritura del cliente no cambia: sigue exigiendo escribir como uno
-- mismo y en las partidas propias.
