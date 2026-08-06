-- Borrar la única convocatoria que hay en la base, que es de pruebas y CONTRADICE el
-- acta oficial.
--
-- QUÉ ES: una convocatoria publicada el 2026-07-15 para el R1 del equipo B (@ Xeraco C),
-- una jornada que se jugó el 2026-01-10. Se creó probando la función de convocatorias
-- durante el desarrollo, medio año después del encuentro.
--
-- POR QUÉ MOLESTA, y no es solo estética: sus ocho resultados por tablero NO coinciden
-- con el acta oficial de la FACV. Comparado fila a fila, ni los jugadores ni los
-- resultados cuadran — el tablero 1 de la convocatoria dice "Jairo Manuel Hernández
-- González, 1" y el acta dice "Castillo Pla, Emilio, 0". Las dos sumas dan 5, así que el
-- marcador que se ve es correcto por casualidad, pero la pantalla de esa jornada enseña
-- dos listas de tableros que se contradicen. Y como los resultados del capitán manda por
-- encima de la sync FACV (`marcadorPreferido`), esa convocatoria de prueba es la que
-- decide el marcador.
--
-- HACE FALTA `service_role`: el trigger `blindaje_lineups` (migración 0007) prohíbe
-- borrar o modificar la convocatoria de un encuentro ya jugado, porque es el registro
-- histórico de lo realmente alineado. El SQL Editor de Supabase corre como `postgres`,
-- que NO se salta el blindaje: solo lo hace `service_role`. Es la misma razón por la que
-- la migración 0008 necesitó esto para borrar el encuentro de prueba.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

begin;

-- Sin esto el borrado falla con el mensaje del blindaje.
set local role service_role;

-- Qué se va a borrar, para verlo antes de que pase. Debe salir 1 convocatoria del
-- equipo B, R1, con 8 tableros y 8 resultados.
select 'convocatorias a borrar (esperado 1)' as comprobacion, count(*)::text as valor
  from public.lineups
union all
select 'de qué jornada',
       coalesce(
         string_agg(
           t.nombre || ' R' || m.ronda || ' ' || case when m.es_local then 'vs ' else '@ ' end || m.rival,
           ', '
         ),
         '(ninguna)'
       )
  from public.lineups l
  join public.matches m on m.id = l.match_id
  join public.teams t on t.id = m.team_id
union all
select 'tableros que se van con ella', count(*)::text from public.lineup_boards
union all
select 'resultados por tablero que se van', count(*)::text from public.board_results;

-- `lineup_boards` cae en cascada con `lineups`, y `board_results` con `lineup_boards`
-- (migración 0005), así que basta con borrar la convocatoria. Se borran TODAS porque hay
-- exactamente una y es esta; si algún día hubiera convocatorias de verdad, este script
-- ya no vale y habría que filtrar por id.
delete from public.lineups;

commit;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'convocatorias que quedan (esperado 0)' as comprobacion, count(*)::text as valor
  from public.lineups
union all
select 'tableros de convocatoria (esperado 0)', count(*)::text from public.lineup_boards
union all
select 'resultados por tablero (esperado 0)', count(*)::text from public.board_results
union all
select 'actas oficiales por tablero (deben seguir: 248)', count(*)::text
  from public.match_boards;
