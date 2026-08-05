"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { generarCodigo } from "@/lib/acceso/codigo";

/**
 * Genera un código nuevo y desactiva el anterior. Los socios ya registrados no
 * se ven afectados: el código solo se comprueba en el momento del alta.
 *
 * El índice `access_codes_uno_activo` (migración 0009) garantiza que no puedan
 * quedar dos activos aunque estas dos escrituras se pisaran.
 */
export async function regenerarCodigo() {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  await admin.from("access_codes").update({ activo: false }).eq("activo", true);
  await admin
    .from("access_codes")
    .insert({ codigo: generarCodigo(), notas: "Regenerado desde /admin/acceso" });
  revalidatePath("/admin/acceso");
}

/**
 * Abre o cierra el registro. Desactivar el código es la forma de decir "ya está
 * todo el club dentro": nadie más puede crear cuenta, y los que ya la tienen
 * siguen entrando con normalidad.
 */
export async function cambiarEstadoCodigo(id: string, activo: boolean) {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  if (activo) {
    // Respetar "solo uno activo": apagar cualquier otro antes de encender este.
    await admin.from("access_codes").update({ activo: false }).eq("activo", true);
  }
  await admin.from("access_codes").update({ activo }).eq("id", id);
  revalidatePath("/admin/acceso");
}
