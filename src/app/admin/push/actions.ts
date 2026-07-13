"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { enviarPushAUsuario } from "@/lib/push/send";

/** true si el usuario autenticado en la sesión actual es admin. */
async function esAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  return Boolean(profile?.is_admin);
}

export async function enviarPushPrueba() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (!(await esAdmin())) return;
  await enviarPushAUsuario(user.id, {
    title: "Fomento de Gandia",
    body: "¡Las notificaciones funcionan! ♞",
    url: "/",
  });
}
