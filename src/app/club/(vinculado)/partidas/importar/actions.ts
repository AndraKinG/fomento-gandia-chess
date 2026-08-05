"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { aPgnExportable } from "@/lib/partidas/pgn";

export type FilaImportar = {
  pgn: string;
  fecha: string;
  rivalNombre: string;
  rivalElo: number | null;
  miElo: number | null;
  color: "blancas" | "negras";
  resultado: "1" | "0.5" | "0";
  ronda: number | null;
  torneoTexto: string | null;
};

/**
 * Guarda de golpe las partidas que el socio ha elegido de un fichero PGN.
 *
 * Escribe con el cliente de usuario: la policy de `games` exige
 * `player_id = mi_ficha()`, así que ni una importación masiva puede colar
 * partidas en la cuenta de otro.
 */
export async function importarPartidas(
  filas: FilaImportar[]
): Promise<{ guardadas: number; error?: string }> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { guardadas: 0, error: "No tienes una ficha vinculada" };
  if (filas.length === 0) return { guardadas: 0, error: "No has elegido ninguna partida." };
  // Tope por tanda: un historial de Lichess puede traer miles de partidas y una
  // inserción sin límite es la forma de agotar la petición a medias, dejando
  // parte importada sin que el socio sepa cuánta.
  if (filas.length > 200) {
    return { guardadas: 0, error: "Demasiadas de golpe. Importa como máximo 200 por tanda." };
  }

  const supabase = await createServerSupabase();
  const { error, count } = await supabase.from("games").insert(
    filas.map((f) => ({
      player_id: sesion.playerId,
      fecha: f.fecha,
      ronda: f.ronda,
      rival_nombre: f.rivalNombre,
      rival_elo: f.rivalElo,
      mi_elo: f.miElo,
      color: f.color,
      resultado: f.resultado,
      torneo_texto: f.torneoTexto,
      pgn: f.pgn,
    })),
    { count: "exact" }
  );
  if (error) return { guardadas: 0, error: error.message };

  revalidatePath("/club/partidas");
  return { guardadas: count ?? filas.length };
}

/**
 * Devuelve un PGN con las partidas del socio, listo para descargar y subir a
 * Lichess, Chess.com o cualquier analizador.
 *
 * Las cabeceras se reconstruyen desde los datos de la app, así que también salen
 * bien las partidas que se metieron a mano en el tablero y no traían ninguna.
 */
export async function exportarMisPartidas(): Promise<{ pgn?: string; error?: string }> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No tienes una ficha vinculada" };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("games")
    .select(
      "fecha, ronda, color, resultado, rival_nombre, mi_elo, rival_elo, torneo_texto, pgn, players!games_player_id_fkey(nombre), tournaments(nombre)"
    )
    .eq("player_id", sesion.playerId)
    .order("fecha", { ascending: true });
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Todavía no tienes partidas que exportar." };

  const pgn = aPgnExportable(
    data.map((p) => ({
      fecha: p.fecha,
      ronda: p.ronda,
      color: p.color,
      resultado: p.resultado,
      duenio: (p.players as unknown as { nombre: string } | null)?.nombre ?? "Yo",
      rivalNombre: p.rival_nombre,
      miElo: p.mi_elo,
      rivalElo: p.rival_elo,
      torneo:
        (p.tournaments as unknown as { nombre: string } | null)?.nombre ??
        p.torneo_texto,
      pgn: p.pgn,
    }))
  );

  return { pgn };
}
