"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function solicitarVinculo(playerId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user.id).single();
  if (profile?.player_id) return { error: "Ya estás vinculado a una ficha" };

  const { error } = await supabase
    .from("link_requests")
    .insert({ user_id: user.id, player_id: playerId });
  if (error) {
    // Postgres error code 23505 = unique constraint violation
    if (error.code === "23505") {
      return { error: "Ese jugador ya tiene una solicitud pendiente, o tú ya tienes una" };
    }
    return { error: "No se pudo crear la solicitud" };
  }
  redirect("/?solicitud=enviada");
}
