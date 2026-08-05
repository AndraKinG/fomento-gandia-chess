"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionActual } from "@/lib/auth/sesion";
import type { Rol } from "@/lib/auth/sesion";

type Resultado = { error?: string };

const ROLES: Rol[] = ["junta", "admin"];

/**
 * Concede o quita un rango.
 *
 * Solo el admin reparte rangos: si la junta pudiera, podría nombrarse admin a sí
 * misma y el reparto de poder dejaría de significar nada. Lo garantiza también la
 * policy de `member_roles` (migración 0011), así que esto es la segunda capa.
 */
export async function cambiarRol(
  profileId: string,
  rol: Rol,
  conceder: boolean
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esAdmin) return { error: "No autorizado" };
  if (!ROLES.includes(rol)) return { error: "Rango no válido" };

  // Quitarse el admin a uno mismo es la forma más rápida de quedarse fuera de la
  // administración sin manera de volver a entrar salvo por el SQL Editor.
  if (!conceder && rol === "admin" && profileId === sesion.userId) {
    return {
      error:
        "No puedes quitarte el admin a ti mismo: te quedarías sin acceso. Nombra antes a otro admin.",
    };
  }

  const admin = createAdminClient();

  if (conceder) {
    const { error } = await admin
      .from("member_roles")
      .upsert({ profile_id: profileId, rol }, { onConflict: "profile_id,rol" });
    if (error) return { error: error.message };
  } else {
    const { error } = await admin
      .from("member_roles")
      .delete()
      .eq("profile_id", profileId)
      .eq("rol", rol);
    if (error) return { error: error.message };

    // La columna vieja `profiles.is_admin` también otorga admin (así lo acepta
    // `is_admin()` en Postgres). Quitar solo el rol dejaría a la persona siendo
    // admin igualmente y el botón parecería no funcionar.
    if (rol === "admin") {
      const { error: errCol } = await admin
        .from("profiles")
        .update({ is_admin: false })
        .eq("id", profileId);
      if (errCol) return { error: errCol.message };
    }
  }

  revalidatePath("/club/admin/roles");
  revalidatePath("/club");
  return {};
}
