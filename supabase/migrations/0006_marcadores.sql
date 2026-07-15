-- Marcador global de un encuentro (sync de resultados FACV, Task 8, Fase 1C).
-- Se usan solo cuando el capitán NO ha anotado resultados por tablero (esos
-- prevalecen siempre: ver board_results, migración 0005, y facv-resultados-apply.ts).
-- numeric(3,1): hasta 8 tableros (marcador máximo posible 8 - 0), con medios puntos.
alter table public.matches
  add column marcador_propio numeric(3,1),
  add column marcador_rival numeric(3,1);
