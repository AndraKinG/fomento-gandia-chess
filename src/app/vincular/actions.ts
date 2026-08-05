"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPushAMuchos } from "@/lib/push/send";

/**
 * Avisa por push a los admins de que hay una solicitud esperando.
 *
 * Sin esto el admin tiene que acordarse de entrar en /admin/vinculaciones a
 * mirar, y durante el alta del club llegan de golpe. Se hace con el cliente de
 * servicio porque hay que leer los `profiles` de OTRA gente (los admins), algo
 * que la RLS niega al socio que acaba de solicitar — y con razón.
 *
 * Nunca hace fallar la solicitud: si el push no sale, la solicitud ya está
 * guardada y aparecerá igual en el panel. Es un aviso, no parte del flujo.
 */
async function avisarAdminsDeSolicitud(nombreFicha: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("is_admin", true);
    const ids = (admins ?? []).map((a) => a.id);
    if (ids.length === 0) return;
    await enviarPushAMuchos(ids, {
      title: "Nueva solicitud de vinculación",
      body: `Alguien dice ser ${nombreFicha}. Revísalo para darle acceso.`,
      url: "/admin/vinculaciones",
    });
  } catch {
    // Silencio a propósito: ver comentario de arriba.
  }
}

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

  // El nombre se lee con el cliente de servicio: el socio aún no está
  // vinculado, así que la RLS de la migración 0009 no le deja leer `players`.
  const admin = createAdminClient();
  const { data: ficha } = await admin
    .from("players").select("nombre").eq("id", playerId).single();
  await avisarAdminsDeSolicitud(ficha?.nombre ?? "un jugador del club");

  // A /vincular, no a la home: hasta que el admin apruebe, la propia pantalla
  // de vinculación es la que muestra el estado de espera (y la home le
  // redirigiría aquí de vuelta).
  redirect("/vincular");
}
