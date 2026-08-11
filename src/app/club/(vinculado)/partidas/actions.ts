"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { validarPartida, type DatosPartida } from "@/lib/partidas/validar";

type Resultado = { error?: string; id?: string };

function refrescar(id?: string): void {
  revalidatePath("/club/partidas");
  if (id) revalidatePath(`/club/partidas/${id}`);
}

/**
 * Guarda una partida del socio autenticado.
 *
 * Escribe con el cliente de USUARIO: la policy de `games` (migración 0014) exige
 * `player_id = mi_ficha()`, así que aunque esta función se equivocara, la base de
 * datos no dejaría guardar una partida en nombre de otro.
 */
export async function guardarPartida(
  datos: DatosPartida & {
    tournamentId?: string;
    rivalId?: string;
    pairingId?: string;
    /** No sale en el repositorio del club: solo la ve su dueño (migración 0039). */
    privada?: boolean;
  }
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No tienes una ficha vinculada" };

  const validacion = validarPartida(datos);
  if (!validacion.ok) return { error: validacion.error };
  const d = validacion.datos;

  // El rival no puede ser uno mismo. Lo comprueba también un check de la base de
  // datos; aquí se hace para dar un mensaje en vez de un error de Postgres.
  if (datos.rivalId && datos.rivalId === sesion.playerId) {
    return { error: "No puedes ponerte a ti mismo como rival." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("games")
    .insert({
      player_id: sesion.playerId,
      tournament_id: datos.tournamentId || null,
      torneo_texto: d.torneoTexto,
      fecha: d.fecha,
      ronda: d.ronda,
      rival_nombre: d.rivalNombre,
      rival_id: datos.rivalId || null,
      rival_elo: d.rivalElo,
      mi_elo: d.miElo,
      color: d.color,
      resultado: d.resultado,
      apertura: d.apertura,
      notas: d.notas,
      pgn: d.pgn,
      privada: Boolean(datos.privada),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Si la partida viene de un emparejamiento de torneo interno, se enlaza. Así la
  // ficha del torneo puede llevar a las jugadas, que es lo que cierra el círculo
  // entre los torneos del club y el repositorio.
  //
  // Un fallo aquí NO deshace la partida: ya está guardada y es lo que el socio
  // quería. Perder el enlace es molesto; perder la partida, no vale.
  if (datos.pairingId) {
    await supabase
      .from("club_pairings")
      .update({ game_id: data.id })
      .eq("id", datos.pairingId);
    revalidatePath("/club/jugar/torneos");
  }

  refrescar();
  return { id: data.id };
}

/** Actualiza una partida propia. La RLS impide tocar las de otro. */
export async function editarPartida(
  id: string,
  datos: DatosPartida & { tournamentId?: string; rivalId?: string; privada?: boolean }
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No tienes una ficha vinculada" };

  const validacion = validarPartida(datos);
  if (!validacion.ok) return { error: validacion.error };
  const d = validacion.datos;

  if (datos.rivalId && datos.rivalId === sesion.playerId) {
    return { error: "No puedes ponerte a ti mismo como rival." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("games")
    .update({
      tournament_id: datos.tournamentId || null,
      torneo_texto: d.torneoTexto,
      fecha: d.fecha,
      ronda: d.ronda,
      rival_nombre: d.rivalNombre,
      rival_id: datos.rivalId || null,
      rival_elo: d.rivalElo,
      mi_elo: d.miElo,
      color: d.color,
      resultado: d.resultado,
      apertura: d.apertura,
      notas: d.notas,
      pgn: d.pgn,
      privada: Boolean(datos.privada),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  refrescar(id);
  return { id };
}

/**
 * Marca o desmarca una partida como favorita de quien está mirando.
 *
 * ES UN MARCADOR DE LECTOR, no un dato de la partida: se pueden guardar las de otros
 * igual que las propias, así que vive en su propia tabla por cuenta (`game_favorites`,
 * migración 0039) y no en una columna de `games`. La RLS solo deja tocar las filas de
 * uno mismo, así que nadie puede saber ni cambiar lo que se guarda otro.
 *
 * Al desmarcar no hace falta comprobar nada: borrar una fila que no existe no es un
 * error, y así el botón funciona igual aunque la pantalla venga desfasada.
 */
export async function cambiarFavorita(
  gameId: string,
  favorita: boolean
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion) return { error: "No autorizado" };

  const supabase = await createServerSupabase();
  const { error } = favorita
    ? await supabase
        .from("game_favorites")
        .upsert(
          { profile_id: sesion.userId, game_id: gameId },
          { onConflict: "profile_id,game_id" }
        )
    : await supabase
        .from("game_favorites")
        .delete()
        .eq("profile_id", sesion.userId)
        .eq("game_id", gameId);
  if (error) return { error: error.message };

  refrescar(gameId);
  return {};
}

/** Borra una partida propia. */
export async function borrarPartida(id: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No tienes una ficha vinculada" };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) return { error: error.message };

  refrescar();
  return {};
}
