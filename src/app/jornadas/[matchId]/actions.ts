"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { esCapitanDeMatch } from "@/lib/auth/es-capitan";
import { calcularMarcador, type Marcador } from "@/lib/marcador";

// SOLO SERVIDOR: action de resultados (Task 7, Fase 1C). Re-verifica el
// permiso ANTES de tocar BD (capitán del equipo de la jornada o admin), igual
// que `equipos/[id]/convocatoria/actions.ts` — la RLS de `board_results`
// (migración 0005) es la barrera DURA que no depende de este chequeo.

type ResultadoGuardar = { ok?: boolean; error?: string; marcador?: Marcador; jugado?: boolean; guardado?: boolean };

const RESULTADOS_VALIDOS = [1, 0.5, 0];

/**
 * Guarda el resultado de un tablero de la convocatoria PUBLICADA de
 * `matchId`, siempre desde el punto de vista de ESTE club (1 = gana nuestro
 * jugador, 0.5 = tablas, 0 = pierde — ver `board_results` en la migración
 * 0005). Cuando, tras guardar, TODOS los tableros de esa convocatoria ya
 * tienen resultado, marca el encuentro como 'jugado' aquí mismo (la action
 * es la única que decide esto; el cliente solo informa qué tablero se tocó).
 */
export async function guardarResultado(
  matchId: string,
  lineupBoardId: string,
  resultado: 1 | 0.5 | 0
): Promise<ResultadoGuardar> {
  if (!RESULTADOS_VALIDOS.includes(resultado)) {
    return { error: "Resultado inválido" };
  }
  if (!(await esCapitanDeMatch(matchId)) && !(await esAdmin())) {
    return { error: "No autorizado" };
  }

  const supabase = await createServerSupabase();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, team_id")
    .eq("id", matchId)
    .maybeSingle();
  if (matchError) return { error: matchError.message };
  if (!match) return { error: "Encuentro no encontrado" };

  const { data: lineup, error: lineupError } = await supabase
    .from("lineups")
    .select("id, lineup_boards(id)")
    .eq("match_id", matchId)
    .eq("estado", "publicada")
    .maybeSingle();
  if (lineupError) return { error: lineupError.message };
  if (!lineup) return { error: "No hay convocatoria publicada para esta jornada" };

  type BoardFila = { id: string };
  const idsTablero = ((lineup.lineup_boards ?? []) as unknown as BoardFila[]).map((b) => b.id);
  if (!idsTablero.includes(lineupBoardId)) {
    return { error: "El tablero no pertenece a la convocatoria publicada de esta jornada" };
  }

  const { error: upsertError } = await supabase
    .from("board_results")
    .upsert(
      { lineup_board_id: lineupBoardId, resultado, updated_at: new Date().toISOString() },
      { onConflict: "lineup_board_id" }
    );
  if (upsertError) return { error: upsertError.message };

  const { data: resultados, error: resultadosError } = await supabase
    .from("board_results")
    .select("resultado")
    .in("lineup_board_id", idsTablero);
  if (resultadosError) return { error: resultadosError.message };

  const marcador = calcularMarcador(
    (resultados ?? []).map((r) => r.resultado as number),
    idsTablero.length
  );
  const completo = idsTablero.length > 0 && marcador.completos === marcador.total;

  if (completo) {
    const { error: matchUpdateError } = await supabase
      .from("matches")
      .update({ estado: "jugado" })
      .eq("id", matchId);
    if (matchUpdateError) {
      return {
        guardado: true,
        error: "Resultado guardado, pero no se pudo actualizar el estado del encuentro; guarda otro resultado o recarga",
        marcador,
      };
    }
  }

  revalidatePath(`/jornadas/${matchId}`);
  revalidatePath(`/equipos/${match.team_id}`);
  revalidatePath("/");

  return { ok: true, marcador, jugado: completo, guardado: true };
}
