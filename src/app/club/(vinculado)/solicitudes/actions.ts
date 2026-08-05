"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionActual } from "@/lib/auth/sesion";

type Resultado = { error?: string };

/**
 * Acepta o rechaza una solicitud de ingreso.
 *
 * Aceptar **no crea nada automáticamente**: no da de alta ninguna ficha ni cuenta.
 * Es a propósito. Lo que viene después —hablar con la persona, la cuota, meterla
 * en el orden de fuerza de la FACV y darle el código del club— pasa fuera de la
 * app, y fingir que un botón lo resuelve solo llevaría a fichas creadas para
 * gente que al final no se apuntó.
 *
 * Lo que hace es dejar constancia de quién decidió qué y cuándo, para que dentro
 * de seis meses se sepa a quién preguntar.
 */
export async function resolverSolicitud(
  id: string,
  estado: "aceptada" | "rechazada",
  notas?: string
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("membership_requests")
    .update({
      estado,
      revisada_por: sesion.userId,
      revisada_at: new Date().toISOString(),
      notas_internas: notas?.trim() || null,
    })
    .eq("id", id)
    .eq("estado", "pendiente"); // no re-resolver algo que ya resolvió otro
  if (error) return { error: error.message };

  revalidatePath("/club/solicitudes");
  revalidatePath("/club");
  return {};
}
