"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { enviarPushAUsuario } from "@/lib/push/send";

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
