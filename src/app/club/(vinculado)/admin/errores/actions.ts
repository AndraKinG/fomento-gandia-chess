"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";

/**
 * Marca un error como resuelto. Si vuelve a pasar, `registrar_error` (0052) lo reabre
 * solo y avisa otra vez: así "resuelto" significa "creo que ya está", y la app te
 * corrige si no.
 *
 * Con la clave de servicio porque `errores` no tiene policy de escritura para nadie;
 * por eso mismo se comprueba antes que quien lo pide es admin.
 */
export async function marcarResuelto(id: number) {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  await admin
    .from("errores")
    .update({ resuelto: true, resuelto_en: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/club/admin/errores");
}
