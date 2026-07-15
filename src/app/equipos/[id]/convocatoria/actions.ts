"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { esCapitanDeMatch } from "@/lib/auth/es-capitan";
import { cargarContextoValidacion, type MatchInfo } from "@/lib/convocatorias/contexto-bd";
import { validar, type Infraccion, type TableroPropuesto } from "@/lib/validador";
import { colorDeTablero } from "@/lib/validador/colores";
import { enviarPushAUsuario } from "@/lib/push/send";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";

// SOLO SERVIDOR: server actions de convocatoria (Task 5, Fase 1C). Cada
// action re-verifica el permiso ANTES de tocar BD (capitán del equipo de la
// jornada o admin); la RLS de `lineups`/`lineup_boards` (migración 0005) es
// la barrera DURA que no depende de este chequeo — estas comprobaciones son
// defensa en profundidad, no la única puerta.

type ResultadoBorrador = { ok?: boolean; error?: string; infracciones: Infraccion[] };
type ResultadoPublicar = {
  ok?: boolean;
  error?: string;
  infracciones?: Infraccion[];
  notificados?: number;
};
type ResultadoDespublicar = { ok?: boolean; error?: string };

/** Capitán del equipo de la jornada o admin: gate común a las 3 actions. */
async function puedeGestionar(matchId: string): Promise<boolean> {
  return (await esCapitanDeMatch(matchId)) || (await esAdmin());
}

function revalidarJornada(teamId: string, matchId: string): void {
  revalidatePath(`/equipos/${teamId}/convocatoria/${matchId}`);
  revalidatePath(`/jornadas/${matchId}`);
}

/**
 * Mapea cada tablero convocado a un push, si el jugador tiene un perfil de
 * usuario vinculado (`profiles.player_id`) y suscripción push registrada
 * (`enviarPushAUsuario` ya no hace nada si no hay suscripción). Usa el
 * cliente ADMIN para leer `profiles` de OTROS jugadores: la RLS de
 * `profiles` solo permite a un capitán normal leer la suya propia.
 */
async function notificarConvocados(
  tableros: TableroPropuesto[],
  match: MatchInfo,
  matchId: string
): Promise<number> {
  if (tableros.length === 0) return 0;

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, player_id")
    .in(
      "player_id",
      tableros.map((t) => t.playerId)
    );
  const userIdPorPlayerId = new Map(
    (profiles ?? [])
      .filter((p): p is { id: string; player_id: string } => Boolean(p.player_id))
      .map((p) => [p.player_id, p.id])
  );

  const destinatarios = tableros
    .map((t) => ({ tablero: t, userId: userIdPorPlayerId.get(t.playerId) }))
    .filter((x): x is { tablero: TableroPropuesto; userId: string } => Boolean(x.userId));
  if (destinatarios.length === 0) return 0;

  const fecha = formatearFechaMadrid(match.fechaHora, { day: "2-digit", month: "long" });

  await Promise.allSettled(
    destinatarios.map(({ tablero, userId }) => {
      const color = colorDeTablero(tablero.tablero, match.esLocal);
      const icono = color === "blancas" ? "♙" : "♟";
      const colorTexto = color === "blancas" ? "Blancas" : "Negras";
      return enviarPushAUsuario(userId, {
        title: `Convocado con el ${match.equipoNombre}`,
        body: `Tablero ${tablero.tablero} · ${icono} ${colorTexto} · ${fecha}`,
        url: `/jornadas/${matchId}`,
      });
    })
  );

  return destinatarios.length;
}

/**
 * Guarda (o actualiza) el borrador de convocatoria de `matchId`. Corre el
 * validador COMPLETO (núcleo + contexto): SOLO los errores "estructurales"
 * (tablero duplicado/fuera de rango, jugador duplicado o desconocido)
 * bloquean el guardado — son inconsistencias de datos, no infracciones del
 * RGC, y un borrador a medio montar (con infracciones reglamentarias
 * pendientes de resolver) debe poder seguir guardándose para continuar
 * editando. El resto de infracciones se devuelven siempre para que el
 * editor en vivo (Task 6) las muestre.
 */
export async function guardarBorrador(
  matchId: string,
  tableros: TableroPropuesto[]
): Promise<ResultadoBorrador> {
  if (!(await puedeGestionar(matchId))) {
    return { error: "No autorizado", infracciones: [] };
  }

  let contexto;
  try {
    contexto = await cargarContextoValidacion(matchId);
  } catch {
    return { error: "Encuentro no encontrado", infracciones: [] };
  }
  const { orden, config, ctx, match } = contexto;

  // El encuentro jugado congela la convocatoria: es el registro histórico de
  // lo realmente alineado (ver `despublicarConvocatoria`) y ni siquiera un
  // borrador nuevo puede pisarlo.
  if (match.estado === "jugado") {
    return {
      error: "El encuentro ya está jugado; la convocatoria no se puede modificar",
      infracciones: [],
    };
  }

  const infracciones = validar(orden, tableros, config, ctx);

  const estructurales = infracciones.filter(
    (i) => i.nivel === "error" && i.articulo === "estructural"
  );
  if (estructurales.length > 0) {
    return {
      error: `No se puede guardar: ${estructurales.length} infracciones estructurales`,
      infracciones,
    };
  }

  const supabase = await createServerSupabase();

  // Si ya hay una convocatoria PUBLICADA, guardar un borrador aquí la
  // demovería en silencio (el capitán vería "guardado" sin darse cuenta de
  // que acaba de despublicar). Se exige el flujo explícito de despublicar.
  const { data: lineupExistente, error: lineupExistenteError } = await supabase
    .from("lineups")
    .select("id, estado")
    .eq("match_id", matchId)
    .maybeSingle();
  if (lineupExistenteError) {
    return { error: lineupExistenteError.message, infracciones };
  }
  if (lineupExistente?.estado === "publicada") {
    return {
      error: "La convocatoria está publicada; despublícala antes de editarla",
      infracciones,
    };
  }

  const { data: lineup, error: lineupError } = await supabase
    .from("lineups")
    .upsert({ match_id: matchId, estado: "borrador" }, { onConflict: "match_id" })
    .select("id")
    .single();
  if (lineupError || !lineup) {
    return { error: lineupError?.message ?? "No se pudo guardar el borrador", infracciones };
  }

  // Reemplazo de tableros: sin una función de BD, borrar+insertar no es
  // atómico (una caída entre medias deja la convocatoria vacía y expuesta a
  // que una publicación concurrente publique "nada"). A escala de club se
  // acepta el riesgo de la ventana, pero se hace recuperable: se guardan los
  // tableros PREVIOS antes de borrar y, si el insert de los nuevos falla, se
  // restauran para no dejar el borrador vacío.
  const { data: tablerosPrevios, error: tablerosPreviosError } = await supabase
    .from("lineup_boards")
    .select("tablero, player_id")
    .eq("lineup_id", lineup.id);
  if (tablerosPreviosError) {
    return { error: tablerosPreviosError.message, infracciones };
  }

  const { error: deleteError } = await supabase
    .from("lineup_boards")
    .delete()
    .eq("lineup_id", lineup.id);
  if (deleteError) return { error: deleteError.message, infracciones };

  if (tableros.length > 0) {
    const filas = tableros.map((t) => ({
      lineup_id: lineup.id as string,
      tablero: t.tablero,
      player_id: t.playerId,
    }));
    const { error: insertError } = await supabase.from("lineup_boards").insert(filas);
    if (insertError) {
      const filasPrevias = (tablerosPrevios ?? []).map((b) => ({
        lineup_id: lineup.id as string,
        tablero: b.tablero,
        player_id: b.player_id,
      }));
      if (filasPrevias.length > 0) {
        const { error: restoreError } = await supabase.from("lineup_boards").insert(filasPrevias);
        if (restoreError) {
          return {
            error: `${insertError.message} — además falló restaurar la convocatoria anterior; el capitán debe volver a guardarla`,
            infracciones,
          };
        }
      }
      return { error: insertError.message, infracciones };
    }
  }

  revalidarJornada(match.teamId, matchId);
  return { ok: true, infracciones };
}

/**
 * Re-valida TODO en el servidor (la UI nunca es la única barrera) y, si no
 * hay ningún `error` (de cualquier artículo, no solo estructural), publica
 * la convocatoria y notifica por push a cada convocado con perfil vinculado.
 */
export async function publicarConvocatoria(matchId: string): Promise<ResultadoPublicar> {
  if (!(await puedeGestionar(matchId))) {
    return { error: "No autorizado" };
  }

  const supabase = await createServerSupabase();
  const { data: lineup, error: lineupError } = await supabase
    .from("lineups")
    .select("id, lineup_boards(tablero, player_id)")
    .eq("match_id", matchId)
    .maybeSingle();
  if (lineupError) return { error: lineupError.message };
  if (!lineup) return { error: "No hay borrador de convocatoria para publicar" };

  type LineupBoardFila = { tablero: number; player_id: string };
  const tableros: TableroPropuesto[] = (
    (lineup.lineup_boards ?? []) as unknown as LineupBoardFila[]
  ).map((b) => ({ tablero: b.tablero, playerId: b.player_id }));

  if (tableros.length === 0) {
    return { error: "No se puede publicar una convocatoria vacía" };
  }

  let contexto;
  try {
    contexto = await cargarContextoValidacion(matchId);
  } catch {
    return { error: "Encuentro no encontrado" };
  }
  const { orden, config, ctx, match } = contexto;
  const infracciones = validar(orden, tableros, config, ctx);
  const errores = infracciones.filter((i) => i.nivel === "error");
  if (errores.length > 0) {
    return { error: `No se puede publicar: ${errores.length} infracciones`, infracciones };
  }

  const { error: updateError } = await supabase
    .from("lineups")
    .update({ estado: "publicada", publicada_at: new Date().toISOString() })
    .eq("id", lineup.id);
  if (updateError) return { error: updateError.message };

  const notificados = await notificarConvocados(tableros, match, matchId);

  revalidarJornada(match.teamId, matchId);
  return { ok: true, notificados };
}

/**
 * Vuelve la convocatoria a borrador (para que el capitán la corrija tras
 * publicarla). Solo permitido si la jornada aún no está jugada: una vez
 * jugado el encuentro, la convocatoria publicada es el registro histórico
 * de lo realmente alineado y no debe poder retirarse.
 */
export async function despublicarConvocatoria(matchId: string): Promise<ResultadoDespublicar> {
  if (!(await puedeGestionar(matchId))) {
    return { error: "No autorizado" };
  }

  let contexto;
  try {
    contexto = await cargarContextoValidacion(matchId);
  } catch {
    return { error: "Encuentro no encontrado" };
  }
  const { match } = contexto;
  if (match.estado === "jugado") {
    return { error: "No se puede despublicar: la jornada ya está jugada" };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("lineups")
    .update({ estado: "borrador" })
    .eq("match_id", matchId);
  if (error) return { error: error.message };

  revalidarJornada(match.teamId, matchId);
  return { ok: true };
}
