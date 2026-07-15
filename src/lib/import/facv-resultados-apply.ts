import { createAdminClient } from "@/lib/supabase/admin";
import { normalizaNombre, URL_CALENDARIO } from "@/lib/import/facv-calendario";
import {
  parseClasificacionFACV,
  parseEnlacesClasificacionFACV,
  parseResultadosFACV,
} from "@/lib/import/facv-resultados";
import { calcularMarcador, formatearPunto } from "@/lib/marcador";

type Sufijo = "A" | "B" | "C";

/** Mismo criterio que `facv-calendario-apply.ts` (duplicado a propósito: cada
 * módulo de import es autocontenido). */
function sufijoEquipo(nombre: string): Sufijo {
  const n = normalizaNombre(nombre);
  if (n.endsWith(" b")) return "B";
  if (n.endsWith(" c")) return "C";
  return "A";
}

export type ResultadoSyncResultados = {
  actualizados: number;
  omitidos: number;
  standingsActualizados: number;
  discrepancias: string[];
  avisos: string[];
  error?: string;
};

/**
 * Lógica interna (sin gate de autorización) de la sync de resultados y
 * clasificación FACV (Task 8, Fase 1C — cron de viernes). Descarga la MISMA
 * página del calendario que la sync de jornadas (T5-1B) y:
 *
 *  1. Marcadores: para cada encuentro YA JUGADO en FACV, si el equipo NO
 *     tiene resultados por tablero anotados por el capitán, rellena
 *     `matches.marcador_propio/marcador_rival` (orientados por `es_local`) y
 *     marca `estado = 'jugado'`. Solo completa marcadores VACÍOS: un re-sync
 *     no pisa un ajuste manual posterior. Si el encuentro SÍ tiene
 *     resultados por tablero (el capitán ya los anotó), esos PREVALECEN
 *     siempre — la sync no los toca — pero, si están completos, compara el
 *     marcador que resulta de sumarlos contra el marcador oficial de FACV: si
 *     no coinciden, se añade una discrepancia al resultado (aviso, no error:
 *     el dato del capitán es el que se queda).
 *  2. Clasificación: por cada uno de los 3 grupos del club, sigue el enlace
 *     "Clasificación" (chess-results, art=46, sin `&rd=`) que la propia
 *     página del calendario enlaza junto al grupo, y REEMPLAZA por completo
 *     las filas de `standings` de ese equipo (marca `es_nuestro` en la fila
 *     del club).
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/admin/equipos/actions.ts`).
 */
export async function sincronizarResultadosFACVCore(): Promise<ResultadoSyncResultados> {
  const vacio: ResultadoSyncResultados = {
    actualizados: 0,
    omitidos: 0,
    standingsActualizados: 0,
    discrepancias: [],
    avisos: [],
  };

  try {
    const admin = createAdminClient();

    const { data: season } = await admin
      .from("seasons").select("id").eq("activa", true).maybeSingle();
    if (!season) return { ...vacio, error: "No hay ninguna temporada activa" };

    const { data: equipos } = await admin
      .from("teams").select("id, nombre").eq("season_id", season.id);
    if (!equipos || equipos.length === 0) {
      return { ...vacio, error: "No hay equipos dados de alta en la temporada activa" };
    }

    const equipoIdPorSufijo = new Map<Sufijo, { id: string; nombre: string }>();
    for (const eq of equipos) {
      equipoIdPorSufijo.set(sufijoEquipo(eq.nombre), { id: eq.id, nombre: eq.nombre });
    }
    const equipoA = equipos.find((e) => sufijoEquipo(e.nombre) === "A");
    const nombreBase = equipoA?.nombre ?? equipos[0].nombre.replace(/ [BC]$/i, "");

    const pagina = await fetch(URL_CALENDARIO, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!pagina.ok) {
      return { ...vacio, error: `No se pudo descargar el calendario (HTTP ${pagina.status})` };
    }
    const htmlCalendario = await pagina.text();

    const resultados = parseResultadosFACV(htmlCalendario, nombreBase);
    if (resultados.length === 0) {
      return { ...vacio, error: "La página no contiene encuentros del club (¿rediseño de la web FACV?)" };
    }

    // --- 1. Marcadores ---

    const idsEquipos = equipos.map((e) => e.id);
    const { data: existentes } = await admin
      .from("matches")
      .select("id, team_id, ronda, estado, es_local, marcador_propio, marcador_rival")
      .in("team_id", idsEquipos);
    const existentePorClave = new Map(
      (existentes ?? []).map((m) => [`${m.team_id}/${m.ronda}`, m])
    );

    // Resultados por tablero ya anotados por el capitán, por match_id
    // (batch: una consulta por tabla en vez de una por encuentro).
    const idsMatches = (existentes ?? []).map((m) => m.id);
    const { data: lineups } = idsMatches.length > 0
      ? await admin.from("lineups").select("id, match_id").eq("estado", "publicada").in("match_id", idsMatches)
      : { data: [] };
    const idsLineups = (lineups ?? []).map((l) => l.id);
    const { data: boards } = idsLineups.length > 0
      ? await admin.from("lineup_boards").select("id, lineup_id").in("lineup_id", idsLineups)
      : { data: [] };
    const idsBoards = (boards ?? []).map((b) => b.id);
    const { data: boardResults } = idsBoards.length > 0
      ? await admin.from("board_results").select("lineup_board_id, resultado").in("lineup_board_id", idsBoards)
      : { data: [] };

    const lineupIdPorMatch = new Map((lineups ?? []).map((l) => [l.match_id as string, l.id as string]));
    const boardsPorLineup = new Map<string, string[]>();
    for (const b of boards ?? []) {
      const lista = boardsPorLineup.get(b.lineup_id as string) ?? [];
      lista.push(b.id as string);
      boardsPorLineup.set(b.lineup_id as string, lista);
    }
    const resultadoPorBoard = new Map((boardResults ?? []).map((r) => [r.lineup_board_id as string, r.resultado as number]));

    let actualizados = 0;
    let omitidos = 0;
    const discrepancias: string[] = [];

    for (const r of resultados) {
      if (r.marcadorLocal === null || r.marcadorVisitante === null) continue; // sin jugar todavía

      const esLocal = normalizaNombre(r.local).includes(normalizaNombre(nombreBase));
      const nombreEquipoFila = esLocal ? r.local : r.visitante;
      const equipo = equipoIdPorSufijo.get(sufijoEquipo(nombreEquipoFila));
      if (!equipo) {
        omitidos++;
        continue;
      }

      const existente = existentePorClave.get(`${equipo.id}/${r.ronda}`);
      if (!existente) {
        omitidos++; // sin jornada creada todavía (sincroniza antes el calendario)
        continue;
      }

      const marcadorPropioFACV = esLocal ? r.marcadorLocal : r.marcadorVisitante;
      const marcadorRivalFACV = esLocal ? r.marcadorVisitante : r.marcadorLocal;

      const idsTableroDeEsteMatch = boardsPorLineup.get(lineupIdPorMatch.get(existente.id) ?? "") ?? [];
      const resultadosTablero = idsTableroDeEsteMatch
        .map((id) => resultadoPorBoard.get(id))
        .filter((v): v is number => v !== undefined);

      if (idsTableroDeEsteMatch.length > 0 && resultadosTablero.length > 0) {
        // El capitán ya anotó resultados por tablero: PREVALECEN. Solo se
        // compara (para avisar) cuando la convocatoria está completa.
        const marcador = calcularMarcador(resultadosTablero, idsTableroDeEsteMatch.length);
        if (marcador.completos === marcador.total && marcador.nuestro !== marcadorPropioFACV) {
          discrepancias.push(
            `${equipo.nombre} ronda ${r.ronda} (vs ${nombreEquipoFila === r.local ? r.visitante : r.local}): ` +
              `el capitán registró ${formatearPunto(marcador.nuestro)}–${formatearPunto(marcador.rival)}, ` +
              `FACV registra ${formatearPunto(marcadorPropioFACV)}–${formatearPunto(marcadorRivalFACV)} — ` +
              `se mantiene el resultado por tablero, revisa la discrepancia`
          );
        }
        continue; // nunca se pisa el resultado por tablero
      }

      if (existente.marcador_propio !== null || existente.marcador_rival !== null) {
        continue; // ya se completó en una sync anterior: no se vuelve a tocar
      }

      const { error } = await admin
        .from("matches")
        .update({
          marcador_propio: marcadorPropioFACV,
          marcador_rival: marcadorRivalFACV,
          estado: "jugado" as const,
        })
        .eq("id", existente.id);
      if (error) return { ...vacio, error: error.message };
      actualizados++;
    }

    // --- 2. Clasificación ---

    const grupoToSufijo = new Map<string, Sufijo>();
    for (const r of resultados) {
      if (grupoToSufijo.has(r.grupo)) continue;
      const esLocal = normalizaNombre(r.local).includes(normalizaNombre(nombreBase));
      const nombreEquipoFila = esLocal ? r.local : r.visitante;
      grupoToSufijo.set(r.grupo, sufijoEquipo(nombreEquipoFila));
    }

    const enlaces = parseEnlacesClasificacionFACV(htmlCalendario, nombreBase);
    let standingsActualizados = 0;
    const avisos: string[] = [];

    for (const enlace of enlaces) {
      const sufijo = grupoToSufijo.get(enlace.grupo);
      const equipo = sufijo ? equipoIdPorSufijo.get(sufijo) : undefined;
      if (!equipo) continue;

      let paginaClasif: Response;
      try {
        paginaClasif = await fetch(enlace.url, { headers: { "user-agent": "Mozilla/5.0" } });
      } catch {
        avisos.push(`${equipo.nombre}: no se pudo descargar la clasificación de chess-results`);
        continue;
      }
      if (!paginaClasif.ok) {
        avisos.push(`${equipo.nombre}: chess-results devolvió HTTP ${paginaClasif.status} al pedir la clasificación`);
        continue;
      }

      const filas = parseClasificacionFACV(await paginaClasif.text());
      if (filas.length === 0) {
        avisos.push(`${equipo.nombre}: la página de chess-results no tiene clasificación (¿rediseño?)`);
        continue;
      }

      const nombreEquipoNorm = normalizaNombre(equipo.nombre);
      const filasStandings = filas.map((f) => ({
        team_id: equipo.id,
        posicion: f.posicion,
        club: f.club,
        puntos: f.puntos,
        es_nuestro: normalizaNombre(f.club) === nombreEquipoNorm,
      }));

      const { error: deleteError } = await admin.from("standings").delete().eq("team_id", equipo.id);
      if (deleteError) return { ...vacio, error: deleteError.message };
      const { error: insertError } = await admin.from("standings").insert(filasStandings);
      if (insertError) return { ...vacio, error: insertError.message };
      standingsActualizados++;
    }

    return { actualizados, omitidos, standingsActualizados, discrepancias, avisos };
  } catch {
    return { ...vacio, error: "Error al procesar la sync de resultados FACV" };
  }
}
