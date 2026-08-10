"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { enviarPushAUsuario } from "@/lib/push/send";

// Sigue siendo push DIRECTO a propósito, sin pasar por `avisar()`: es el botón
// de prueba del admin para comprobar que la suscripción del navegador
// funciona, y tiene que poder mandar un push sin dejar rastro en la bandeja
// de nadie (si pasara por `avisar()` quedaría una fila en `notifications` que
// no significa nada para el admin ni para ningún otro socio).
export async function enviarPushPrueba() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (!(await esAdmin())) return;
  await enviarPushAUsuario(user.id, {
    title: "Fomento de Gandia",
    body: "¡Las notificaciones funcionan! ♞",
    url: "/club",
  });
}
