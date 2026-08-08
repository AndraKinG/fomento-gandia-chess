-- ARREGLO DE SEGURIDAD en la política del chat de partida (migración 0022).
--
-- QUÉ ESTABA MAL: la comprobación de "escribo como yo mismo" era
--
--   exists (select 1 from public.profiles p
--           where p.id = auth.uid() and p.player_id = player_id)
--
-- y ese `player_id` sin cualificar NO es el de la fila que se inserta. Dentro de la
-- subconsulta, Postgres resuelve primero contra las tablas de la propia subconsulta,
-- y `profiles` TIENE una columna `player_id`, así que la condición se leía como
-- `p.player_id = p.player_id`: siempre cierta.
--
-- Resultado: cualquier socio vinculado podía insertar un mensaje EN NOMBRE DE OTRO
-- en una partida suya. No se ha explotado —solo hay dos cuentas y los dos mensajes
-- que existen son legítimos—, pero la puerta estaba abierta.
--
-- La otra mitad de la política estaba bien por casualidad: `g.id = live_game_id`
-- funciona porque `live_games` no tiene ninguna columna llamada `live_game_id`, así
-- que la referencia sale hacia fuera y apunta a la fila insertada.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

drop policy if exists "chat: escribo yo en mis partidas" on public.live_chat;

create policy "chat: escribo yo en mis partidas" on public.live_chat
  for insert with check (
    -- CUALIFICADO CON LA TABLA. Es la línea del arreglo.
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.player_id = live_chat.player_id
    )
    and exists (
      select 1 from public.live_games g
      where g.id = live_chat.live_game_id
        and exists (
          select 1 from public.profiles p2
          where p2.id = auth.uid() and p2.player_id in (g.blancas_id, g.negras_id)
        )
    )
  );
