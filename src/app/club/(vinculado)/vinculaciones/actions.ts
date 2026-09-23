"use server";

/**
 * Aprobar o rechazar que un socio sea quien dice ser.
 *
 * LA JUNTA TAMBIÉN, desde el 2026-09-23. Antes solo el admin, y eso lo convertía en un
 * cuello de botella: quien elige su ficha se queda en una pantalla de espera y no puede
 * entrar hasta que alguien le apruebe. Con 46 socios registrándose a la vez, una sola
 * persona aprobando deja a la mitad esperando sin entender por qué.
 *
 * `esJunta()` INCLUYE AL ADMIN (igual que `es_junta()` en Postgres), así que esto no le
 * quita nada a nadie. Lo que NO se abre es repartir rangos: eso sigue siendo del admin,
 * porque quien puede nombrarse a sí mismo deja de tener un rango.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esJunta } from "@/lib/auth/es-admin";

export async function aprobarVinculo(requestId: string) {
  if (!(await esJunta())) return;
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
    revalidatePath("/club/vinculaciones");
    return;
  }
  await admin.from("link_requests")
    .update({ status: "aprobada" }).eq("id", requestId);
  revalidatePath("/club/vinculaciones");
}

export async function rechazarVinculo(requestId: string) {
  if (!(await esJunta())) return;
  const admin = createAdminClient();
  await admin.from("link_requests")
    .update({ status: "rechazada" }).eq("id", requestId);
  revalidatePath("/club/vinculaciones");
}
