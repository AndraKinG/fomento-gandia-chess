-- Jugar en la app, en vivo y con reloj (decisión del propietario, 2026-08-08).
--
-- Dos formas de que nazca una partida, las dos pedidas: un RETO entre socios, o un
-- emparejamiento de un torneo interno (y entonces el resultado cuenta para la
-- clasificación y el ELO del club, y el PGN acaba en el repositorio).
--
-- EL RELOJ Y LAS REGLAS LOS LLEVA EL SERVIDOR. Aquí solo se guarda el estado; nadie
-- escribe estas tablas directamente desde el navegador, y por eso las políticas de
-- escritura son las que son: se puede LEER lo tuyo, pero mover es cosa de una acción
-- de servidor con la clave de servicio, que revalida turno, legalidad y tiempo.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

-- ---------------------------------------------------------------- retos ----
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),

  reta_id uuid not null references public.players(id) on delete cascade,
  retado_id uuid not null references public.players(id) on delete cascade,

  -- Cadencia en las unidades en que la dice la gente: "5+3".
  base_min int not null check (base_min between 1 and 180),
  incremento_s int not null default 0 check (incremento_s between 0 and 60),

  -- Con qué piezas quiere jugar quien reta. 'azar' lo decide el servidor al aceptar.
  color text not null default 'azar' check (color in ('blancas', 'negras', 'azar')),

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
  -- La partida que ha salido del reto, cuando se acepta.
  live_game_id uuid,

  -- Nadie se reta a sí mismo.
  constraint reto_a_otro check (reta_id <> retado_id)
);

create index if not exists challenges_retado_idx
  on public.challenges (retado_id, estado);

-- ------------------------------------------------------------- partidas ----
create table if not exists public.live_games (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),

  blancas_id uuid not null references public.players(id) on delete cascade,
  negras_id uuid not null references public.players(id) on delete cascade,

  -- De dónde sale. 'torneo' enlaza con el emparejamiento, y al acabar la partida
  -- el resultado se escribe también allí.
  origen text not null default 'reto' check (origen in ('reto', 'torneo')),
  club_pairing_id uuid references public.club_pairings(id) on delete set null,

  -- Cadencia, ya en milisegundos: es como se opera con ella y así no hay que
  -- multiplicar en cada lectura.
  base_ms int not null check (base_ms > 0),
  incremento_ms int not null default 0 check (incremento_ms >= 0),

  -- LAS JUGADAS SON LA ÚNICA FUENTE DE VERDAD de la posición. El FEN no se guarda
  -- a propósito: dos copias del mismo dato acaban discrepando, y reconstruir la
  -- posición desde las jugadas cuesta microsegundos.
  jugadas text[] not null default '{}',

  turno text not null default 'w' check (turno in ('w', 'b')),
  blancas_ms int not null,
  negras_ms int not null,
  -- Cuándo se registró la última jugada. null = el reloj todavía no ha arrancado,
  -- así que nadie pierde por tiempo mientras el rival no ha entrado.
  ultima_jugada_en timestamptz,

  resultado text check (resultado in ('1-0', '0-1', '1/2-1/2')),
  motivo text check (motivo in (
    'mate', 'tiempo', 'abandono', 'ahogado', 'tablas-acordadas',
    'material-insuficiente', 'triple-repeticion', 'regla-50'
  )),
  terminada_en timestamptz,

  -- Oferta de tablas viva, si la hay: de quién es.
  tablas_ofrecidas_por uuid references public.players(id) on delete set null,

  constraint jugadores_distintos check (blancas_id <> negras_id),
  -- El resultado y el motivo van juntos o no van: un resultado sin motivo no se
  -- puede contar en el acta, y un motivo sin resultado no significa nada.
  constraint resultado_con_motivo check (
    (resultado is null and motivo is null) or (resultado is not null and motivo is not null)
  )
);

create index if not exists live_games_blancas_idx on public.live_games (blancas_id);
create index if not exists live_games_negras_idx on public.live_games (negras_id);
-- Las partidas vivas se consultan a menudo (¿tengo alguna en marcha?).
create index if not exists live_games_en_juego_idx
  on public.live_games (resultado) where resultado is null;

alter table public.challenges
  add constraint challenges_live_game_fk
  foreign key (live_game_id) references public.live_games(id) on delete set null;

-- ------------------------------------------------------------ chat ---------
create table if not exists public.live_chat (
  id uuid primary key default gen_random_uuid(),
  live_game_id uuid not null references public.live_games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 300),
  creado_en timestamptz not null default now()
);

create index if not exists live_chat_partida_idx
  on public.live_chat (live_game_id, creado_en);

-- ------------------------------------------------------------- permisos ----
alter table public.challenges enable row level security;
alter table public.live_games enable row level security;
alter table public.live_chat enable row level security;

-- Los retos los ve quien los manda y quien los recibe, y nadie más.
create policy "retos: los mios" on public.challenges
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.player_id in (reta_id, retado_id)
    )
  );

-- Retar sí se puede desde el cliente: no hay nada que validar más allá de que el
-- que reta sea uno mismo, y eso lo dice la propia política.
create policy "retos: retar yo" on public.challenges
  for insert with check (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.player_id = reta_id
    )
  );

-- Aceptar o rechazar NO se hace desde aquí: crea una partida y reparte colores, así
-- que pasa por una acción de servidor. Esta política solo permite CANCELAR el
-- propio reto.
create policy "retos: cancelar el mio" on public.challenges
  for update using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.player_id = reta_id
    )
  ) with check (estado = 'cancelado');

-- LAS PARTIDAS SON PÚBLICAS PARA LOS SOCIOS: en un club se mira lo que juegan los
-- demás, y las de los torneos internos tienen que poder seguirse.
create policy "partidas en vivo legibles" on public.live_games
  for select using (public.esta_vinculado());

-- Y NADIE LAS ESCRIBE DESDE EL NAVEGADOR. Ni una política de update: mover, ofrecer
-- tablas o abandonar pasa por una acción de servidor que revalida turno, legalidad y
-- reloj. Con una política de escritura, cualquiera con la clave anónima podría
-- ponerse un resultado.

create policy "chat de partida legible" on public.live_chat
  for select using (public.esta_vinculado());

-- Escribir en el chat sí es del cliente, pero SOLO en tus partidas y SOLO como tú.
create policy "chat: escribo yo en mis partidas" on public.live_chat
  for insert with check (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.player_id = player_id
    )
    and exists (
      select 1 from public.live_games g
      where g.id = live_game_id
        and exists (
          select 1 from public.profiles p2
          where p2.id = auth.uid() and p2.player_id in (g.blancas_id, g.negras_id)
        )
    )
  );

-- ---------------------------------------------------------- tiempo real ----
-- Sin esto el rival no ve la jugada hasta que recarga, que es justo lo contrario de
-- jugar en vivo. `replica identity full` hace que el aviso lleve la fila entera.
alter table public.live_games replica identity full;
alter table public.live_chat replica identity full;

alter publication supabase_realtime add table public.live_games;
alter publication supabase_realtime add table public.live_chat;
alter publication supabase_realtime add table public.challenges;
