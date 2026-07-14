"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { limitesDiaMadrid } from "@/lib/fecha-madrid";

type Resultado = { error?: string };

/**
 * Marca la disponibilidad del jugador autenticado para TODAS las jornadas
 * pendientes del club cuya `fecha_hora` caiga en `fecha` (YYYY-MM-DD, día de
 * calendario en Madrid) — un solo toque cubre A, B y C si juegan el mismo
 * sábado. Usa el cliente de usuario: la RLS de `availability` obliga a que
 * cada jugador solo pueda escribir su propia fila (vía `profiles.player_id`).
 */
export async function marcarDisponibilidad(
  fecha: string,
  estado: "disponible" | "no_disponible" | "duda"
): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user.id).single();
  if (!profile?.player_id) return { error: "No tienes una ficha vinculada" };

  const { desde, hasta } = limitesDiaMadrid(fecha);
  const { data: jornadas, error: jornadasError } = await supabase
    .from("matches")
    .select("id")
    .eq("estado", "pendiente")
    .gte("fecha_hora", desde)
    .lt("fecha_hora", hasta);
  if (jornadasError) return { error: jornadasError.message };
  if (!jornadas || jornadas.length === 0) {
    return { error: "No hay jornadas pendientes en esa fecha" };
  }

  const ahora = new Date().toISOString();
  const filas = jornadas.map((j) => ({
    match_id: j.id,
    player_id: profile.player_id as string,
    estado,
    updated_at: ahora,
  }));

  const { error } = await supabase
    .from("availability")
    .upsert(filas, { onConflict: "match_id,player_id" });
  if (error) return { error: error.message };

  revalidatePath("/disponibilidad");
  return {};
}
