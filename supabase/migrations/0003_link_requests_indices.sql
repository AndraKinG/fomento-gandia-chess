-- Evita solicitudes duplicadas pendientes: una por usuario y una por ficha.
create unique index if not exists link_requests_una_pendiente_por_usuario
  on public.link_requests (user_id) where status = 'pendiente';
create unique index if not exists link_requests_una_pendiente_por_jugador
  on public.link_requests (player_id) where status = 'pendiente';
