"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Marca un aviso como leído.
 *
 * CLIENTE DE USUARIO A PROPÓSITO, nunca la clave de servicio: la policy de
 * UPDATE de `notifications` ("avisos: marco leidos los mios", migración 0028)
 * ya exige `profile_id = auth.uid()` tanto en el `using` como en el
 * `with check`, así que es la RLS la que decide qué fila puede tocar cada
 * uno. Repetir aquí a mano "¿es tuyo el aviso?" sería lógica duplicada que,
 * el día que se desincronice de la policy, es peor que no tenerla — mejor
 * dejar que la base lo rechace sola. Sí hace falta comprobar que hay sesión:
 * sin ella ni merece la pena intentar la consulta.
 *
 * Si el aviso trae `url`, la navegación pasa por AQUÍ (con `redirect`) en vez
 * de dejarla en manos del cliente: así la fila entera puede ser un único
 * `<form>`/`<button>` sin ningún componente cliente de por medio, siguiendo
 * el patrón que ya usa la app para acciones de servidor (`BotonAccion`).
 */
export async function marcarLeido(avisoId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Se lee antes de escribir, sobre todo para saber a dónde navegar; de paso
  // sirve de comprobación (la RLS de SELECT ya filtra los ajenos: si el aviso
  // no es tuyo ni eres admin, esto devuelve null y ni se intenta el update).
  const { data: aviso, error: leerError } = await supabase
    .from("notifications")
    .select("url")
    .eq("id", avisoId)
    .maybeSingle();
  if (leerError) return { error: leerError.message };
  if (!aviso) return { error: "Aviso no encontrado" };

  const { error: updateError } = await supabase
    .from("notifications")
    .update({ leido_en: new Date().toISOString() })
    .eq("id", avisoId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/club/avisos");

  // `redirect` lanza una excepción especial (NEXT_REDIRECT) que Next necesita
  // ver escapar sin que nadie la atrape: por eso queda fuera de cualquier
  // try/catch de esta función, como último paso.
  if (aviso.url) redirect(aviso.url);
  return {};
}
