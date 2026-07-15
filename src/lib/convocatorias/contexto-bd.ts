import { createAdminClient } from "@/lib/supabase/admin";
import { fuerza } from "@/lib/elo/fuerza";
import { fechaMadrid, limitesDiaMadrid } from "@/lib/fecha-madrid";
import { normalizaNombre } from "@/lib/import/facv-calendario";
import { bloqueDe, calcularIndices, calcularInicios } from "@/lib/validador/contexto";
import type { ConfigEquipo, ContextoClub, JugadorOrden } from "@/lib/validador/tipos";

// SOLO SERVIDOR: usa el cliente admin (service role), que salta la RLS. NUNCA
// importar este módulo desde un Client Component ni desde código que se
// ejecute en el navegador (editor en vivo): las actions de servidor (Task 5)
// deben verificar autorización (admin o capitán del equipo) ANTES de llamar
// a `cargarContextoValidacion`, igual que el resto de `src/lib/import/*-apply.ts`.

type JugadorFila = {
  nombre: string;
  elo_fide: number | null;
  elo_feda: number | null;
  elo_otro: number | null;
  excepcion_tecnificacion: boolean;
  excepcion_veterano: boolean;
};

type EquipoFila = {
  id: string;
  nombre: string;
  categoria: string;
  margen_elo: number | null;
  num_tableros: number;
};

/** Datos de la propia jornada, ya resueltos (Task 5, actions): evita que cada
 * action tenga que repetir su propia consulta a `matches`/`teams` solo para
 * saber si es local, el estado, la fecha o el nombre del equipo/rival. */
export type MatchInfo = {
  esLocal: boolean;
  estado: string;
  fechaHora: string | null;
  teamId: string;
  equipoNombre: string;
  rival: string;
};

/** Resultado listo para pasar directamente a `validar()`/`validarContexto()`
 * (ver `src/lib/validador`). */
export type ContextoValidacion = {
  orden: JugadorOrden[];
  config: ConfigEquipo;
  ctx: ContextoClub;
  match: MatchInfo;
};

/**
 * Carga desde BD todo lo que necesita el validador (Tasks 2-3) para revisar
 * la convocatoria de `matchId`: el orden de fuerza del club, la
 * ConfigEquipo del equipo de esa jornada y el ContextoClub (bloques,
 * alineaciones de la misma fecha, misma sede y contadores del 50%).
 *
 * Server-only, solo lectura: no escribe nada en BD. Usa el cliente admin
 * porque necesita leer datos de VARIOS equipos del club (incluidos
 * borradores de otros capitanes) para las comprobaciones cruzadas de R7/R8,
 * algo que la RLS de `lineups` no permite a un capitán normal.
 */
export async function cargarContextoValidacion(matchId: string): Promise<ContextoValidacion> {
  const admin = createAdminClient();

  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, team_id, fecha_hora, es_local, estado, rival")
    .eq("id", matchId)
    .single();
  if (matchError || !match) {
    throw new Error(`No se encontró la jornada ${matchId}`);
  }

  const { data: equipoActual, error: equipoActualError } = await admin
    .from("teams")
    .select("id, season_id, num_tableros, margen_elo")
    .eq("id", match.team_id)
    .single();
  if (equipoActualError || !equipoActual) {
    throw new Error(`No se encontró el equipo de la jornada ${matchId}`);
  }

  // --- Equipos de la temporada, orden fijo A→B→C por NOMBRE ---------------
  // NO se ordena por `categoria`: es texto libre no jerárquico ("1ª
  // Autonómica Sur" vs. "2ª Autonómica" no son comparables de forma fiable
  // como cadenas, y dos equipos de la MISMA categoría textual no tendrían
  // orden alguno). El NOMBRE sí codifica la jerarquía por convención del
  // club (import FACV, Tasks 1B-T2/1B-T4): el equipo A es el nombre base
  // ("Fomento de Gandia"), el B añade el sufijo " B" y el C el sufijo " C".
  // Ordenar alfabéticamente por nombre basta, porque el nombre base es
  // siempre PREFIJO (más corto, por tanto "menor") de los sufijados, y
  // dentro de los sufijados "B" < "C" en el mismo punto de comparación.
  const { data: equiposTemporada, error: equiposError } = await admin
    .from("teams")
    .select("id, nombre, categoria, margen_elo, num_tableros")
    .eq("season_id", equipoActual.season_id)
    .order("nombre", { ascending: true });
  if (equiposError || !equiposTemporada || equiposTemporada.length === 0) {
    throw new Error("No se pudieron cargar los equipos de la temporada");
  }
  const equipos = equiposTemporada as EquipoFila[];

  const equipoIndice = equipos.findIndex((e) => e.id === match.team_id);
  if (equipoIndice === -1) {
    throw new Error(`El equipo ${match.team_id} no pertenece a la temporada activa`);
  }
  const totalEquipos = equipos.length;
  const numTablerosPorEquipo = equipos.map((e) => e.num_tableros);
  const teamIdAIndice = new Map(equipos.map((e, i) => [e.id, i]));
  const configPorTeamId = new Map<string, ConfigEquipo>(
    equipos.map((e) => [
      e.id,
      {
        margenElo: e.margen_elo,
        numTableros: e.num_tableros,
        // Ver comentario más abajo (config del equipo validado): SIEMPRE
        // false, también para los equipos ajenos combinados en R8/52.4.
        permitirInversionDentroMargen: false,
      },
    ])
  );

  // --- División autonómica (art. 51.5.c) -----------------------------------
  // Heurística sobre texto libre (`categoria` no es un campo estructurado de
  // "nivel de liga"): se considera división autonómica si, normalizado sin
  // acentos y en minúsculas, contiene "autonomic" (cubre 1ª/2ª/3ª Autonómica,
  // cualquier redacción) o "division de honor". Si la FACV cambia la
  // redacción o el admin escribe la categoría de otra forma y el check
  // falla, el propio admin puede corregirlo simplemente renombrando
  // `categoria` para que contenga una de esas palabras clave — no hace
  // falta ningún cambio de código ni un campo booleano nuevo.
  const esDivisionAutonomica = equipos.map((e) => {
    const cat = normalizaNombre(e.categoria);
    return cat.includes("autonomic") || cat.includes("division de honor");
  });

  // --- Orden de fuerza del club ---------------------------------------------
  const { data: filasOrden, error: ordenError } = await admin
    .from("force_order")
    .select(
      "player_id, numero, bis_index, elo_oficial, players(nombre, elo_fide, elo_feda, elo_otro, excepcion_tecnificacion, excepcion_veterano)"
    )
    .eq("season_id", equipoActual.season_id);
  if (ordenError || !filasOrden) {
    throw new Error("No se pudo cargar el orden de fuerza de la temporada");
  }

  const orden: JugadorOrden[] = filasOrden.map((f) => {
    const jugador = f.players as unknown as JugadorFila;
    return {
      playerId: f.player_id as string,
      nombre: jugador.nombre,
      numero: f.numero as number,
      bisIndex: f.bis_index as number,
      // fuerza = elo_oficial (FACV) si está disponible; si no, se recurre al
      // cálculo interno (fuerza(), Task 5 de Fase 1) a partir de los ELOs
      // propios del jugador.
      fuerza:
        (f.elo_oficial as number | null) ??
        fuerza({ eloFide: jugador.elo_fide, eloFeda: jugador.elo_feda, eloOtro: jugador.elo_otro }),
      excepcionMargen: jugador.excepcion_tecnificacion || jugador.excepcion_veterano,
    };
  });

  const config: ConfigEquipo = {
    margenElo: equipoActual.margen_elo,
    numTableros: equipoActual.num_tableros,
    // Fase 1C-T4: SIEMPRE false por ahora. El RGC es ambiguo entre la
    // lectura estricta del art. 51.2 y la lectura "a contrario" del art.
    // 52.3 (ver el comentario extenso en `ConfigEquipo.permitirInversionDentroMargen`,
    // tipos.ts) y la FACV no ha confirmado (a 2026) cuál prevalece para las
    // ligas reales. Hasta que la Task 8 (pasada integral) lo verifique
    // empíricamente contra la liga real, este loader adopta SIEMPRE la
    // postura segura (estricta, sin excepción) — no hay forma de que un
    // capitán o admin active el modo permisivo desde la UI todavía.
    permitirInversionDentroMargen: false,
  };

  // --- Alineaciones de la misma fecha (arts. 54-55) y misma sede (52.4) ----
  let alineacionesMismaFecha: ContextoClub["alineacionesMismaFecha"] = [];
  let mismaSede: ContextoClub["mismaSede"] = [];

  const diaMadrid = match.fecha_hora ? fechaMadrid(match.fecha_hora as string) : null;
  if (diaMadrid) {
    const { desde, hasta } = limitesDiaMadrid(diaMadrid);
    const { data: matchesMismaFecha, error: matchesMismaFechaError } = await admin
      .from("matches")
      .select("id, team_id, es_local")
      .in(
        "team_id",
        equipos.map((e) => e.id)
      )
      .gte("fecha_hora", desde)
      .lt("fecha_hora", hasta);
    if (matchesMismaFechaError) {
      throw new Error("No se pudieron cargar las jornadas de la misma fecha");
    }

    const otrasJornadas = (matchesMismaFecha ?? []).filter((m) => m.id !== match.id);

    if (otrasJornadas.length > 0) {
      // Se incluyen lineups en borrador Y publicadas: para las comprobaciones
      // cruzadas (R7 "mismo jugador dos actas" y R8 "misma sede") importa la
      // alineación PROPUESTA en tiempo real, no solo la ya cerrada — dos
      // capitanes pueden estar editando a la vez y conviene avisarles antes
      // de publicar, no solo auditar después.
      const { data: lineupsMismaFecha, error: lineupsError } = await admin
        .from("lineups")
        .select("id, match_id, estado, lineup_boards(tablero, player_id)")
        .in(
          "match_id",
          otrasJornadas.map((m) => m.id)
        )
        .in("estado", ["borrador", "publicada"]);
      if (lineupsError) {
        throw new Error("No se pudieron cargar las alineaciones de la misma fecha");
      }

      type LineupFila = {
        match_id: string;
        lineup_boards: { tablero: number; player_id: string }[] | null;
      };
      const lineups = (lineupsMismaFecha ?? []) as unknown as LineupFila[];
      const jornadaPorId = new Map(otrasJornadas.map((m) => [m.id, m]));

      alineacionesMismaFecha = lineups.map((l) => {
        const jornada = jornadaPorId.get(l.match_id)!;
        return {
          equipoIndice: teamIdAIndice.get(jornada.team_id)!,
          playerIds: (l.lineup_boards ?? []).map((b) => b.player_id),
        };
      });

      // Misma sede (art. 52.4): solo si ESTA jornada es local Y la otra
      // jornada del club, ese mismo día, también lo es (ambos equipos
      // jugando en el mismo sitio). Si esta jornada es visitante, el club no
      // controla la sede del rival y el 52.4 no aplica (mismaSede = []).
      if (match.es_local) {
        const jornadasLocalesMismaSede = otrasJornadas.filter((m) => m.es_local);
        mismaSede = jornadasLocalesMismaSede.flatMap((m) => {
          const lineup = lineups.find((l) => l.match_id === m.id);
          if (!lineup) return [];
          const idxOtroEquipo = teamIdAIndice.get(m.team_id);
          const configOtroEquipo = configPorTeamId.get(m.team_id);
          if (idxOtroEquipo === undefined || !configOtroEquipo) return [];
          return [
            {
              equipoIndice: idxOtroEquipo,
              alineacion: (lineup.lineup_boards ?? []).map((b) => ({
                tablero: b.tablero,
                playerId: b.player_id,
              })),
              config: configOtroEquipo,
            },
          ];
        });
      }
    }
  }

  // --- Regla del 50% (art. 51.3): vecesEnSuperior + rondasJugadasPorEquipo -
  // NOTA: cuentan SOLO las jornadas con estado 'jugado' (no las pendientes)
  // Y con lineup en estado 'publicada' (un borrador nunca fue la alineación
  // realmente disputada) — de la temporada de `equipoActual`.
  const rondasJugadasPorEquipo = new Array<number>(totalEquipos).fill(0);
  const vecesEnSuperior: Record<string, number> = {};

  const { data: matchesJugados, error: matchesJugadosError } = await admin
    .from("matches")
    .select("id, team_id")
    .in(
      "team_id",
      equipos.map((e) => e.id)
    )
    .eq("estado", "jugado");
  if (matchesJugadosError) {
    throw new Error("No se pudieron cargar las jornadas jugadas de la temporada");
  }

  if (matchesJugados && matchesJugados.length > 0) {
    const { data: lineupsJugados, error: lineupsJugadosError } = await admin
      .from("lineups")
      .select("match_id, lineup_boards(player_id)")
      .in(
        "match_id",
        matchesJugados.map((m) => m.id)
      )
      .eq("estado", "publicada");
    if (lineupsJugadosError) {
      throw new Error("No se pudieron cargar las alineaciones publicadas de jornadas jugadas");
    }

    type LineupJugadaFila = { match_id: string; lineup_boards: { player_id: string }[] | null };
    const lineupsPublicadas = (lineupsJugados ?? []) as unknown as LineupJugadaFila[];
    const jornadaJugadaPorId = new Map(matchesJugados.map((m) => [m.id, m]));

    // Bloque de ORIGEN de cada jugador según el orden de fuerza actual y el
    // tamaño de bloque actual de cada equipo — misma lógica que usa el
    // validador en vivo (`bloqueDe`, `contexto.ts`), reexportada desde allí
    // para no triplicarla en un tercer módulo.
    const indicePorId = calcularIndices(orden);
    const inicios = calcularInicios(numTablerosPorEquipo);

    for (const lineup of lineupsPublicadas) {
      const jornada = jornadaJugadaPorId.get(lineup.match_id);
      if (!jornada) continue;
      const idxEquipoJornada = teamIdAIndice.get(jornada.team_id);
      if (idxEquipoJornada === undefined) continue;

      rondasJugadasPorEquipo[idxEquipoJornada] += 1;

      for (const board of lineup.lineup_boards ?? []) {
        const idxJugador = indicePorId.get(board.player_id);
        if (idxJugador === undefined) continue; // ya no está en el orden de fuerza actual
        const bloqueOrigen = bloqueDe(idxJugador, numTablerosPorEquipo, inicios);
        if (bloqueOrigen === null) continue; // bis fuera de bloque: sin equipo de origen
        if (idxEquipoJornada < bloqueOrigen) {
          // Jugó esta ronda en un equipo de índice MENOR (categoría
          // superior) que su equipo de origen actual.
          vecesEnSuperior[board.player_id] = (vecesEnSuperior[board.player_id] ?? 0) + 1;
        }
      }
    }
  }

  const ctx: ContextoClub = {
    equipoIndice,
    totalEquipos,
    numTablerosPorEquipo,
    esDivisionAutonomica,
    alineacionesMismaFecha,
    mismaSede,
    vecesEnSuperior,
    rondasJugadasPorEquipo,
  };

  return {
    orden,
    config,
    ctx,
    match: {
      esLocal: match.es_local as boolean,
      estado: match.estado as string,
      fechaHora: match.fecha_hora as string | null,
      teamId: match.team_id as string,
      equipoNombre: equipos[equipoIndice].nombre,
      rival: match.rival as string,
    },
  };
}
