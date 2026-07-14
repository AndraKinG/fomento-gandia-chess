"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function esAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  return Boolean(data?.is_admin);
}

export async function aprobarVinculo(requestId: string) {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("link_requests").select("user_id, player_id")
    .eq("id", requestId).eq("status", "pendiente").single();
  if (!req) return;
  const { error: updateErr, data: updated } = await admin
    .from("profiles")
    .update({ player_id: req.player_id }).eq("id", req.user_id)
    .select("id");
  if (updateErr || !updated || updated.length === 0) {
    // No se pudo actualizar el perfil: dejar la solicitud en pendiente.
    revalidatePath("/admin/vinculaciones");
    return;
  }
  await admin.from("link_requests")
    .update({ status: "aprobada" }).eq("id", requestId);
  revalidatePath("/admin/vinculaciones");
}

export async function rechazarVinculo(requestId: string) {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  await admin.from("link_requests")
    .update({ status: "rechazada" }).eq("id", requestId);
  revalidatePath("/admin/vinculaciones");
}
