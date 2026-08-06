-- Acta por tableros de cada jornada de Interclubs, importada de chess-results.
--
-- POR QUÉ HACE FALTA: hasta ahora la app solo sabía el marcador global de un
-- encuentro ("3½ – 4½"), que es lo único que publica el calendario de la FACV. El
-- detalle —quién jugó en cada tablero, con qué color, contra quién, con qué ELO y con
-- qué resultado— vive en chess-results.com, al que la FACV enlaza con "Alineación".
-- Sin esto, la pantalla de una jornada ya jugada solo podía decir "Jornada jugada" y
-- el marcador, que es exactamente lo que el propietario reportó.
--
-- POR QUÉ NO SE REUTILIZAN `lineups` / `board_results`: esas tablas son la
-- convocatoria del CAPITÁN, existen solo si él la publica en la app, y guardan solo a
-- nuestros jugadores. El acta es el documento oficial, existe para todas las jornadas
-- jugadas —incluidas las once de 2026, que se jugaron antes de que la app existiera— y
-- trae también al rival con su nombre y su ELO. Son dos cosas distintas y meterlas en
-- la misma tabla obligaría a distinguirlas con una columna de origen en cada consulta.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

create table if not exists public.match_boards (
  match_id uuid not null references public.matches(id) on delete cascade,
  tablero int not null check (tablero between 1 and 12),

  -- TODO SE GUARDA DESDE NUESTRO PUNTO DE VISTA, no desde el del equipo local, igual
  -- que `board_results` y `games`. El acta viene con local y visitante, y quien
  -- importa ya sabe de qué lado jugábamos: hacer esa traducción una vez al importar
  -- evita que cada consulta y cada pantalla tengan que volver a decidirlo.
  nuestro_nombre text not null,
  nuestro_elo int check (nuestro_elo is null or nuestro_elo between 0 and 3500),
  -- Ficha del socio cuando el nombre del acta se ha podido cruzar con `players`.
  -- Queda null si no cuadra: el acta escribe los nombres como los tiene la FIDE y
  -- puede haber diferencias de tildes o de orden. Es un enlace de conveniencia, no
  -- una verdad — la partida se enseña igual sin él.
  nuestro_player_id uuid references public.players(id) on delete set null,
  -- true si nuestro jugador llevaba blancas en ese tablero.
  nuestras_blancas boolean not null,

  rival_nombre text not null,
  rival_elo int check (rival_elo is null or rival_elo between 0 and 3500),

  -- Desde nuestro punto de vista. null = tablero sin jugar todavía, o doble
  -- incomparecencia. Mismo vocabulario que `board_results` y `games`.
  resultado text check (resultado is null or resultado in ('1', '0.5', '0')),
  -- true si el punto salió de una incomparecencia y no de una partida jugada. Suma
  -- al marcador igual, pero no es una partida: sin esta marca, la pantalla la
  -- enseñaría como si se hubiera jugado.
  incomparecencia boolean not null default false,

  actualizado_at timestamptz not null default now(),

  primary key (match_id, tablero)
);

create index if not exists match_boards_por_socio
  on public.match_boards (nuestro_player_id)
  where nuestro_player_id is not null;

alter table public.match_boards enable row level security;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Lectura para cualquier socio vinculado: es el acta oficial de una jornada del
-- club, el dato más público que hay — de hecho está en chess-results.com para
-- cualquiera.
drop policy if exists "actas legibles por socios" on public.match_boards;
create policy "actas legibles por socios" on public.match_boards
  for select to authenticated
  using (public.esta_vinculado() or public.is_admin());

-- NADIE escribe esto desde la aplicación con su propia sesión: lo rellena el
-- importador con la clave de servicio, que se salta la RLS. Sin política de
-- escritura, un socio no puede inventarse un acta ni corregir la suya — y si algún
-- día el acta oficial está mal, se corrige en la FACV y se vuelve a sincronizar, que
-- es donde tiene que corregirse.
drop policy if exists "actas gestiona admin" on public.match_boards;
create policy "actas gestiona admin" on public.match_boards
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tabla match_boards' as comprobacion,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'match_boards'
       ) then 'creada' else 'NO - REVISAR' end as valor
union all
select 'policies (esperado 2)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'match_boards'
union all
select 'tableros guardados ahora', count(*)::text from public.match_boards;
