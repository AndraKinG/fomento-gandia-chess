"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function solicitarVinculo(playerId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  const { error } = await supabase
    .from("link_requests")
    .insert({ user_id: user.id, player_id: playerId });
  if (error) return { error: "No se pudo crear la solicitud (¿ya tienes una?)" };
  redirect("/?solicitud=enviada");
}
