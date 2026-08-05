"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPushAMuchos } from "@/lib/push/send";
import { validarSolicitud } from "@/lib/solicitudes/ingreso";

type Resultado = { ok?: true; error?: string };

/** Solicitudes por IP y hora antes de cortar. */
const MAX_POR_HORA = 5;

/**
 * Recibe una solicitud de ingreso desde la web PÚBLICA.
 *
 * Escribe con la clave de servicio a propósito, y por eso la tabla no tiene
 * ninguna policy de inserción para `anon` (ver migración 0013): si la tuviera,
 * cualquiera con la clave anónima —que vive en el navegador de todo el mundo—
 * podría escribir en la tabla saltándose esta validación y este freno.
 *
 * Este es el único sitio del proyecto donde un visitante sin sesión provoca una
 * escritura, así que es el único que necesita freno por IP.
 */
export async function solicitarIngreso(formData: FormData): Promise<Resultado> {
  const validacion = validarSolicitud({
    nombre: String(formData.get("nombre") ?? ""),
    email: String(formData.get("email") ?? ""),
    telefono: String(formData.get("telefono") ?? ""),
    mensaje: String(formData.get("mensaje") ?? ""),
  });
  if (!validacion.ok) return { error: validacion.error };

  const cabeceras = await headers();
  const ip =
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabeceras.get("x-real-ip") ||
    "local";

  const admin = createAdminClient();

  // Freno por IP, reutilizando la tabla que ya existe para el alta de socios
  // (migración 0009): es la misma necesidad —evitar que se martillee un endpoint
  // abierto— y no merece una tabla propia.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("registro_intentos")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", desde);
  if ((count ?? 0) >= MAX_POR_HORA) {
    return { error: "Has enviado varias solicitudes seguidas. Espera un rato." };
  }
  await admin.from("registro_intentos").insert({ ip });

  const { error } = await admin.from("membership_requests").insert(validacion.datos);
  if (error) {
    // 23505 = índice único: ya hay una solicitud pendiente con ese email. No es
    // un fallo desde el punto de vista de quien la manda, así que se le dice que
    // ya está hecha en vez de un error rojo.
    if (error.code === "23505") {
      return { error: "Ya tenemos tu solicitud y la estamos mirando. Gracias por la paciencia." };
    }
    return { error: "No se pudo enviar la solicitud. Inténtalo de nuevo en un rato." };
  }

  await avisarALaJunta(validacion.datos.nombre);
  return { ok: true };
}

/**
 * Avisa por push a quien gestiona socios (junta y admin).
 *
 * Nunca hace fallar la solicitud: ya está guardada y aparecerá en el panel
 * aunque el aviso no salga.
 */
async function avisarALaJunta(nombre: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: porRol }, { data: porColumna }] = await Promise.all([
      admin.from("member_roles").select("profile_id").in("rol", ["junta", "admin"]),
      // La columna antigua sigue otorgando admin, igual que en `is_admin()`.
      admin.from("profiles").select("id").eq("is_admin", true),
    ]);
    const ids = [
      ...new Set([
        ...(porRol ?? []).map((r) => r.profile_id),
        ...(porColumna ?? []).map((p) => p.id),
      ]),
    ];
    if (ids.length === 0) return;

    await enviarPushAMuchos(ids, {
      title: "Alguien quiere unirse al club",
      body: `${nombre} ha enviado una solicitud de ingreso.`,
      url: "/club/solicitudes",
    });
  } catch {
    // Silencio a propósito: ver comentario de arriba.
  }
}
