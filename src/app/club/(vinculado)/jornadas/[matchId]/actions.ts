"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { esCapitanDeMatch } from "@/lib/auth/es-capitan";
import { calcularMarcador, type Marcador } from "@/lib/marcador";

// SOLO SERVIDOR: action de resultados (Task 7, Fase 1C). Re-verifica el
// permiso ANTES de tocar BD (capitán del equipo de la jornada o admin), igual
// que `equipos/[id]/convocatoria/actions.ts` — la RLS de `board_results`
// (migración 0005) es la barrera DURA que no depende de este chequeo.
//
// Auditoría 2026-08-10 ("Crítico 1"): tras la migración 0027, los triggers
// `blindaje_lineup_boards`/`blindaje_board_results`/`blindaje_matches`
// congelan `board_results` y `matches.estado` de una jornada 'jugada' para
// cualquier conexión que NO sea `service_role`. La comprobación de permisos
// de arriba (`esCapitanDeMatch`/`esAdmin`) ya ha pasado en este punto, así que
// el upsert de `board_results` y, si hace falta, el update de `matches` se
// hacen con `createAdminClient()`: esta action de servidor es la ÚNICA puerta
// que le queda al capitán para corregir un resultado de una jornada cerrada
// (typo, tablero equivocado) sin tener que reabrir la convocatoria — bloquear
// esto en el trigger sin dar esta salida habría roto esa corrección, que el
// propietario quiere conservar.

type ResultadoGuardar = { ok?: boolean; error?: string; marcador?: Marcador; jugado?: boolean; guardado?: boolean };

const RESULTADOS_VALIDOS = [1, 0.5, 0];

/**
 * Guarda el resultado de un tablero de la convocatoria PUBLICADA de
 * `matchId`, siempre desde el punto de vista de ESTE club (1 = gana nuestro
 * jugador, 0.5 = tablas, 0 = pierde — ver `board_results` en la migración
 * 0005). Cuando, tras guardar, TODOS los tableros de esa convocatoria ya
 * tienen resultado, marca el encuentro como 'jugado' aquí mismo (la action
 * es la única que decide esto; el cliente solo informa qué tablero se tocó).
 *
 * Item 7c (revisión final 1C): NO hay ningún guard que impida llamar a esta
 * action cuando `matches.estado` YA es 'jugado' (a diferencia de las actions
 * de convocatoria, que congelan la jornada jugada). Es una decisión
 * DELIBERADA, no un descuido: los capitanes necesitan poder corregir un
 * resultado mal anotado (typo, tablero equivocado) después de que el
 * encuentro se cierre, sin tener que reabrir la convocatoria entera. Desde la
 * migración 0027 esto SÍ está restringido a nivel de BD para cualquier
 * escritura que no sea `service_role` (ver comentario de cabecera): esta
 * action sigue funcionando igual porque escribe con la clave de servicio tras
 * comprobar el permiso, que es precisamente la puerta que el trigger deja
 * abierta.
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

  // Migración 0027: el trigger `blindaje_board_results` congela la tabla para
  // una jornada 'jugada' salvo `service_role`. El permiso ya se ha comprobado
  // arriba (capitán del equipo o admin), así que se escribe con el cliente
  // admin — es la única forma de que esta corrección siga funcionando tras
  // aplicar la migración, tanto la primera vez que se anota un resultado como
  // cuando se corrige uno de una jornada ya cerrada.
  const admin = createAdminClient();

  const { error: upsertError } = await admin
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
    // Mismo motivo que el upsert de arriba: el trigger `blindaje_matches`
    // (0027) rechaza la transición 'jugado' -> distinto de 'jugado' desde una
    // sesión normal, pero la de 'pendiente' -> 'jugado' la deja pasar; se usa
    // igualmente el cliente admin aquí para no depender de esa distinción y
    // para que la escritura del estado tenga la misma puerta que el resultado
    // que la provoca.
    const { error: matchUpdateError } = await admin
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

  revalidatePath(`/club/jornadas/${matchId}`);
  revalidatePath(`/club/equipos/${match.team_id}`);
  revalidatePath("/");

  return { ok: true, marcador, jugado: completo, guardado: true };
}
