-- Un torneo del club puede organizarse EN LA APP o en ChessPairings.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0049.
--
-- LA DECISIÓN, tal y como la tomó el propietario el 2026-08-26 tras analizar
-- chesspairings.org: **hay dos clases de torneo del club y cada una tiene su sitio.**
--
-- - **Rápido y entre unos cuantos, porque apetece** → EN LA APP, como hasta ahora.
--   Emparejamos nosotros, se juega aquí con reloj y chat, y cuenta para el ELO del club.
-- - **El social del club, presencial y en serio** → EN CHESSPAIRINGS. Ellos tienen el
--   emparejamiento oficial de la FIDE (bbpPairings v6), 28 desempates y el export TRF,
--   que es el único camino si algún día se quiere homologar para ELO FIDE. Nada de eso
--   se puede replicar aquí a un coste razonable.
--
-- EN CHESSPAIRINGS NO SE JUEGA, y por eso el reparto funciona: comprobado en su página
-- pública, un emparejamiento es «Bd | Blancas | Pts | Resultado | Pts | Negras» y no
-- lleva ni una jugada, ni PGN, ni tablero, ni reloj. Es una herramienta de ÁRBITRO para
-- torneos de tablero: empareja, se juega en madera, el árbitro anota y publica.
--
-- LO QUE ESTA MIGRACIÓN EVITA ES DOS FUENTES DE VERDAD. Si un torneo se organiza fuera,
-- la clasificación y los resultados los manda ChessPairings, y nuestra pantalla tiene
-- que ser SOLO LECTURA para él: sin generar rondas, sin anotar resultados y sin mesas.
-- Con las dos puertas abiertas, un resultado metido en un sitio y no en el otro deja dos
-- clasificaciones distintas y nadie sabe cuál es la buena — el mismo motivo por el que el
-- marcador de la FACV no se puede editar a mano (blindaje de la 0027).
--
-- LO QUE SIGUE SIENDO NUESTRO en un torneo de fuera: apuntarse (con su ficha y su mote),
-- los avisos, los coches y el enlace. Eso ChessPairings no lo tiene.
--
-- POR QUÉ NO SE TOCA NADA DE LOS TORNEOS DE FUERA DE LA FACV: ahí ya tenemos el circuito
-- montado y funcionando —calendario, enlaces a su página y a info64, y las actas de
-- chess-results— así que meter una tercera fuente sería redundancia. Decisión expresa del
-- propietario: "si son torneos de fuera no hay nada que hacer ahí".

alter table public.club_tournaments
  -- 'app' por defecto: los torneos que ya existen se organizaron aquí, y un torneo nuevo
  -- sin decir nada es de los de siempre.
  add column if not exists organizado_en text not null default 'app'
    check (organizado_en in ('app', 'chesspairings')),
  -- La página pública del torneo en ChessPairings. Es la que enseña clasificación,
  -- emparejamientos, participantes y cross-table sin necesidad de cuenta.
  add column if not exists url_publica text;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columnas nuevas (esperado 2)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.club_tournaments'::regclass
    and attname in ('organizado_en', 'url_publica')
    and attnum > 0 and not attisdropped
union all
select 'torneos existentes marcados como de la app',
       coalesce(count(*)::text, '0')
  from public.club_tournaments where organizado_en = 'app';
