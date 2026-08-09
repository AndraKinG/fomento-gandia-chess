-- Pedir volver una jugada atrás (decisión del propietario, 2026-08-09).
--
-- PARA QUÉ: en una partida rápida y sobre todo desde el móvil, un dedo mal puesto
-- mueve una pieza que no era. Sin esto, la única salida es seguir jugando una
-- partida que ya no cuenta, o abandonar. Como en Chess.com: uno lo pide y el otro
-- decide, que es lo que lo hace justo.
--
-- UNA COLUMNA Y NO UNA TABLA: solo puede haber UNA petición viva por partida, se
-- resuelve en segundos y no interesa el histórico. Igual que `tablas_ofrecidas_por`.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

alter table public.live_games
  add column if not exists vuelta_pedida_por uuid
    references public.players(id) on delete set null;
