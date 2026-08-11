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
  datos: DatosPartida & { tournamentId?: string; rivalId?: string; pairingId?: string }
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
  datos: DatosPartida & { tournamentId?: string; rivalId?: string }
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
    })
    .eq("id", id);
  if (error) return { error: error.message };

  refrescar(id);
  return { id };
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
