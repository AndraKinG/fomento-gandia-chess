"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Registra un latido de uso: "esta cuenta está delante de la app ahora".
 *
 * QUÉ GUARDA Y QUÉ NO (la decisión entera está en la migración 0032): suma uno a
 * los contadores agregados del día y deja, como mucho una vez al día, la marca
 * "esta cuenta entró hoy". Ni hora, ni página, ni duración por persona.
 *
 * La identidad sale SIEMPRE de la sesión del servidor, y la escritura va por
 * `registrar_uso`, cuya ejecución está revocada a los clientes: por REST no se
 * pueden inflar los números. Lo único que un socio podría hacer es llamar a esta
 * action en bucle y engordar los latidos de SU día — puede falsear una
 * estadística, no leer ni tocar nada, así que no merece más candado que este
 * comentario.
 *
 * NUNCA FALLA HACIA FUERA: un tropiezo apuntando uso no puede molestar a quien
 * está usando la app, que ni sabe que esto existe.
 */
export async function latir(esVisita: boolean): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await createAdminClient().rpc("registrar_uso", {
      p_profile: user.id,
      p_visita: esVisita,
    });
  } catch {
    // Silencio a propósito: ver cabecera.
  }
}
