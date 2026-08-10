"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GrupoAviso } from "@/lib/avisos/politica";

/** Los únicos cuatro valores válidos. Cualquier otra cosa que llegue del
 *  cliente se descarta antes de tocar la base (ver comentario más abajo). */
const GRUPOS_VALIDOS: readonly GrupoAviso[] = ["interclubs", "torneos", "partidas", "gestion"];

function esGrupoValido(valor: string): valor is GrupoAviso {
  return (GRUPOS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Guarda qué grupos de avisos tiene silenciados el socio de la sesión.
 *
 * POR QUÉ CON CLAVE DE SERVICIO Y NO "EL CLIENTE DE USUARIO" (el encargo
 * original de esta tarea decía lo segundo; es imposible y fallaría en
 * silencio). La única policy de UPDATE que existe sobre `profiles` es
 * "perfil escribe admin" (supabase/migrations/0001_init.sql), y exige
 * `public.is_admin()` tanto en el USING como en el WITH CHECK. Un socio
 * normal que intente actualizar su propia fila con su sesión no salta
 * ningún error: Postgres simplemente no encuentra ninguna fila que cumpla
 * la policy, así que el UPDATE afecta a 0 filas y no lanza. La pantalla
 * parecería haber guardado la preferencia y en realidad no habría cambiado
 * nada en la base — el peor tipo de fallo, porque no se nota.
 *
 * Tampoco se abre una policy nueva para esta columna: limitarla solo a
 * `avisos_silenciados` (y no a `email`, `player_id`, `is_admin`...)
 * necesitaría además un trigger que bloqueara el resto de columnas de la
 * fila. Eso es más superficie de ataque que esta action, que ya resuelve el
 * problema comprobando la sesión y filtrando los valores antes de escribir:
 * es el mismo patrón que usan las otras ~20 acciones de servidor del
 * proyecto (comprobar identidad y rol ANTES de escribir con service_role).
 *
 * El id del perfil sale SIEMPRE de la sesión del servidor (`user.id`), nunca
 * de un argumento que mande el cliente: así no hay forma de que alguien
 * llame a esta action pidiendo cambiar la fila de otro socio.
 */
export async function guardarPreferenciasAvisos(
  silenciados: GrupoAviso[]
): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Filtra cualquier valor que no sea uno de los cuatro grupos: lo que llega
  // del cliente no es de fiar (podría venir de una llamada manual a la
  // action, no solo del interruptor de la pantalla), y a diferencia de
  // `notifications.grupo` (que sí tiene un CHECK en la 0028),
  // `profiles.avisos_silenciados` es un array de texto sin restricción en la
  // base: esta validación es la única puerta que tiene.
  const limpios = Array.from(new Set(silenciados.filter(esGrupoValido)));

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ avisos_silenciados: limpios })
    .eq("id", user.id);

  if (error) return { error: "No se pudo guardar la preferencia" };
  return {};
}
