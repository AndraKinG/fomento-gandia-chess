-- Blindaje del histórico de jornadas jugadas (auditoría de lógica y seguridad,
-- 2026-08-10, "Crítico 1" y "Crítico 2") y arreglo del chat en vivo ("Importante —
-- Avisos falsos en el chat").
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0026.

-- ---------------------------------------------------------------------------
-- A1. El blindaje de 0007 protegía `lineups` pero no a sus tablas hijas.
-- ---------------------------------------------------------------------------
--
-- QUÉ CIERRA: el trigger `blindaje_lineups` (0007) impide tocar la CABECERA de una
-- convocatoria (`lineups`) una vez que el encuentro está 'jugado', pero nunca miró
-- `lineup_boards` (quién jugó cada tablero) ni `board_results` (con qué resultado).
-- Esas dos tablas seguían con la RLS normal de "capitán de este equipo puede
-- escribir" (0005), sin ninguna comprobación de `matches.estado`. Un capitán podía
-- entrar por REST directamente (sin pasar por ninguna action de servidor) y
-- reescribir tableros o resultados de una jornada ya cerrada, sin dejar rastro ni
-- pasar por el validador. Con esta migración, tocar cualquiera de las dos tablas
-- de una jornada jugada exige `service_role` — igual que ya exigía `lineups`.
--
-- CÓMO SE RESUELVE EL ENCUENTRO: `lineup_boards` no tiene `match_id` directo, hay
-- que subir hasta `lineups`; `board_results` tiene que subir dos niveles, hasta
-- `lineup_boards` y de ahí a `lineups`. `coalesce(new, old)` cubre los tres verbos
-- (INSERT solo trae `new`, DELETE solo trae `old`, UPDATE trae los dos y cualquiera
-- de las dos filas identifica la misma convocatoria).
create or replace function public.blindar_lineup_boards()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fila public.lineup_boards;
  encuentro_jugado boolean;
begin
  -- Mismo bypass que 0007: el backend ya ha validado antes de escribir con la
  -- clave de servicio (p. ej. una corrección administrativa puntual).
  if current_setting('role', true) = 'service_role' then
    return coalesce(new, old);
  end if;

  fila := coalesce(new, old);

  select (m.estado = 'jugado') into encuentro_jugado
    from public.lineups l
    join public.matches m on m.id = l.match_id
    where l.id = fila.lineup_id;

  if encuentro_jugado then
    raise exception
      'El encuentro ya está jugado: los tableros de la convocatoria son registro histórico de lo realmente alineado y no se pueden modificar ni eliminar directamente.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists blindaje_lineup_boards on public.lineup_boards;
create trigger blindaje_lineup_boards
  before insert or update or delete on public.lineup_boards
  for each row execute function public.blindar_lineup_boards();

create or replace function public.blindar_board_results()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fila public.board_results;
  encuentro_jugado boolean;
begin
  if current_setting('role', true) = 'service_role' then
    return coalesce(new, old);
  end if;

  fila := coalesce(new, old);

  select (m.estado = 'jugado') into encuentro_jugado
    from public.lineup_boards lb
    join public.lineups l on l.id = lb.lineup_id
    join public.matches m on m.id = l.match_id
    where lb.id = fila.lineup_board_id;

  if encuentro_jugado then
    raise exception
      'El encuentro ya está jugado: el resultado por tablero es registro histórico y no se puede modificar ni eliminar directamente por RLS. La corrección de un resultado se hace desde la app (guardarResultado), que escribe con la clave de servicio tras comprobar que quien llama es capitán del equipo o admin.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists blindaje_board_results on public.board_results;
create trigger blindaje_board_results
  before insert or update or delete on public.board_results
  for each row execute function public.blindar_board_results();

-- ---------------------------------------------------------------------------
-- A2. La policy "matches edita capitan" (0004) dejaba libres TODAS las columnas.
-- ---------------------------------------------------------------------------
--
-- QUÉ CIERRA:
--  (1) LA VÍA QUE RODEABA EL BLINDAJE DE ARRIBA (Y EL DE 0007): un capitán podía
--      poner su propio encuentro 'jugado' otra vez en 'pendiente' — eso SÍ lo
--      dejaba pasar la policy de 0004, que solo mira `es_capitan_de(team_id)` —
--      editar entonces la convocatoria y los resultados con tranquilidad (los
--      triggers de blindaje ya no aplican porque `matches.estado` ya no es
--      'jugado') y devolverlo a 'jugado' a mano. Reabrir es la mitad del ataque:
--      la otra mitad ya no funciona gracias a A1, pero cerrar solo A1 dejaría
--      esta puerta abierta igualmente para forzar el estado sin pasar los
--      tableros.
--  (2) EL MARCADOR ESCRITO A MANO (Crítico 2): `marcador_propio`/`marcador_rival`
--      los pone la sync FACV (`facv-resultados-apply.ts`, service_role) o
--      `guardarResultado` (también service_role tras esta migración, ver B1 del
--      encargo), nunca una sesión de capitán directa — así se garantiza que
--      siempre salen de una fuente coherente (o el acta oficial, o la suma de
--      los resultados por tablero), nunca de un número suelto sin relación con
--      nada.
--  (3) LA IDENTIDAD DE LA JORNADA (`team_id`, `ronda`, `rival`, `es_local`): la
--      fija el calendario importado de la FACV. Dejarla abierta a un capitán
--      permitiría, por ejemplo, que el encuentro R3 del equipo A "se convirtiera"
--      en el R3 del equipo B con un UPDATE, desligando convocatoria y resultados
--      de la jornada real sin que quede ningún indicio de qué pasó.
--
-- QUÉ SE PERMITE A PROPÓSITO (no se toca en el trigger, así que sigue abierto
-- con la RLS normal):
--  - `fecha_hora` y `sede`: la matriz de permisos concede esto al capitán (mover
--    la hora o el sitio de la partida es logística suya, no altera el registro
--    histórico ni depende de ningún validador).
--  - La transición 'pendiente' -> 'jugado': la hace `guardarResultado` al
--    completar todos los tableros. Tras el cambio de B1 esa escritura concreta
--    ya usa `service_role` y por tanto ni pasa por este trigger, pero se deja
--    constancia explícita de que esta dirección NUNCA se bloquea: si algún día
--    esa transición se hiciera con la sesión del capitán, debe seguir
--    funcionando. Lo único que se bloquea es la dirección contraria (reapertura).
--
-- Se compara con `is distinct from` porque `marcador_propio`/`marcador_rival`
-- son NULLABLE (0006): con `<>` a secas, null <> null da null (ni verdadero ni
-- falso) y la comprobación se cuela sin disparar la excepción.
create or replace function public.blindar_matches()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if old.estado = 'jugado' and new.estado is distinct from 'jugado' then
    raise exception
      'Un encuentro jugado no se puede volver a pendiente desde una sesión de capitán: es la vía que se usaba para rodear el blindaje de la convocatoria y los resultados.';
  end if;

  if new.marcador_propio is distinct from old.marcador_propio
     or new.marcador_rival is distinct from old.marcador_rival then
    raise exception
      'El marcador no se edita a mano: sale siempre de los resultados por tablero (guardarResultado) o de la sincronización con la FACV, las dos con clave de servicio.';
  end if;

  if new.team_id is distinct from old.team_id
     or new.ronda is distinct from old.ronda
     or new.rival is distinct from old.rival
     or new.es_local is distinct from old.es_local then
    raise exception
      'La identidad de la jornada (equipo, ronda, rival, condición de local) viene del calendario importado y no se edita desde una sesión de capitán.';
  end if;

  return new;
end;
$$;

drop trigger if exists blindaje_matches on public.matches;
create trigger blindaje_matches
  before update on public.matches
  for each row execute function public.blindar_matches();

-- ---------------------------------------------------------------------------
-- A3. El chat de la partida en vivo no impedía fabricar un aviso del sistema.
-- ---------------------------------------------------------------------------
--
-- QUÉ CIERRA: desde 0026, un mensaje es "de alguien" (`player_id` no nulo,
-- `evento` nulo) o "un evento del sistema" (`player_id` nulo, `evento` con
-- texto) — la restricción `live_chat_con_autor_o_evento` obliga a que sea al
-- menos una de las dos cosas, pero nunca prohibió las DOS a la vez. La policy de
-- 0024 solo comprueba que el `player_id` sea el propio y que la partida sea
-- suya: no dice nada de `evento`. Resultado: un jugador podía insertar una fila
-- con SU `player_id` (pasa la policy) Y un `evento` no nulo (nadie lo mira), y la
-- mesa (`Mesa.tsx`) la pintaba como aviso del sistema porque decidía por
-- `m.evento` truthy en vez de por si había autor. Así se fabrica un "el rival
-- abandona" o "tablas aceptadas" que no ha pasado, sin que el estado real de la
-- partida cambie. El otro lado del arreglo (que la mesa pinte por `playerId ===
-- null`, no por `evento`) es el punto B2 del encargo — hacen falta los dos: la
-- policy es el candado del DATO, la vista es la defensa en profundidad de la
-- PANTALLA, y ninguna de las dos sola cierra el hueco si la otra sigue como
-- estaba.
--
-- NO SE TOCA `live_chat_con_autor_o_evento`: sigue siendo "al menos una de las
-- dos". Lo que se añade aquí es más estricto que eso, específicamente para lo
-- que puede insertar un CLIENTE: nunca las dos juntas. Los eventos de verdad
-- los sigue escribiendo el servidor con la clave de servicio, que salta la RLS
-- por completo y no pasa por esta policy.
drop policy if exists "chat: escribo yo en mis partidas" on public.live_chat;

create policy "chat: escribo yo en mis partidas" on public.live_chat
  for insert with check (
    live_chat.evento is null
    and exists (
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

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'triggers de blindaje creados (esperado 3)' as comprobacion, count(*)::text as valor
  from pg_trigger
  where tgname in ('blindaje_lineup_boards', 'blindaje_board_results', 'blindaje_matches')
    and not tgisinternal
union all
select 'nombres de los triggers',
       coalesce(string_agg(tgname, ', ' order by tgname), '(ninguno)')
  from pg_trigger
  where tgname in ('blindaje_lineup_boards', 'blindaje_board_results', 'blindaje_matches')
    and not tgisinternal
union all
select 'policy de chat exige evento nulo (esperado 1)', count(*)::text
  from pg_policies
  where schemaname = 'public' and tablename = 'live_chat'
    and policyname = 'chat: escribo yo en mis partidas'
    and lower(with_check) like '%evento%is null%'
union all
select 'restriccion autor-o-evento intacta (esperado 1)', count(*)::text
  from pg_constraint
  where conname = 'live_chat_con_autor_o_evento';
