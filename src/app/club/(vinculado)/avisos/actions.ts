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

  // `.is("leido_en", null)`: esta función la llama la fila "Ir al aviso", que en
  // la bandeja solo se pinta para avisos SIN leer (uno ya leído usa un enlace
  // normal, sin pasar por aquí). El guard es defensa extra por si algún día se
  // invoca sobre uno ya leído: no se debe reescribir `leido_en`, que perdería
  // la fecha real de cuándo se leyó de verdad.
  const { error: updateError } = await supabase
    .from("notifications")
    .update({ leido_en: new Date().toISOString() })
    .eq("id", avisoId)
    .is("leido_en", null);
  if (updateError) return { error: updateError.message };

  revalidatePath("/club/avisos");

  // `redirect` lanza una excepción especial (NEXT_REDIRECT) que Next necesita
  // ver escapar sin que nadie la atrape: por eso queda fuera de cualquier
  // try/catch de esta función, como último paso.
  if (aviso.url) redirect(aviso.url);
  return {};
}

/**
 * Marca un aviso como leído SIN navegar a ningún sitio, aunque traiga `url`.
 *
 * Es la acción de "marcar leído" de la fila, separada de "ir al aviso"
 * (`marcarLeido` de arriba) porque hoy las dos venían pegadas en el mismo
 * botón: con avisos de disponibilidad para los 46 socios dos veces por semana
 * (antes solo con push, este es justo el agujero que se cerró), vaciar la
 * bandeja a mano suponía volver a entrar una vez por cada aviso. Misma forma
 * de seguridad que `marcarLeido`: RLS decide qué fila es tuya, aquí solo se
 * comprueba que hay sesión.
 */
export async function marcarLeidoQuieto(avisoId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // `.is("leido_en", null)`: el botón que llama a esto solo se pinta para
  // avisos sin leer, pero el guard evita que un envío repetido (doble clic,
  // pestaña duplicada) reescriba la fecha real de cuándo se leyó.
  const { error } = await supabase
    .from("notifications")
    .update({ leido_en: new Date().toISOString() })
    .eq("id", avisoId)
    .is("leido_en", null);
  if (error) return { error: error.message };

  revalidatePath("/club/avisos");
  return {};
}

/**
 * Marca como leídos TODOS los avisos sin leer del socio de la sesión, de golpe.
 *
 * CLIENTE DE USUARIO, igual que las otras dos: la policy de UPDATE de
 * `notifications` fija `profile_id = auth.uid()` en `using` y `with check`, así
 * que aunque no se mande ningún id, la base solo va a tocar lo que sea tuyo.
 * El `.eq("profile_id", user.id)` de aquí NO es la comprobación de seguridad
 * (esa la hace la RLS) — es solo para aprovechar el índice `notifications_bandeja`
 * y no depender únicamente de la policy para acotar la fila. Y NADA de esto sale
 * del cliente: `user.id` es el de la sesión del propio servidor, no un dato que
 * mande el navegador.
 *
 * `.is("leido_en", null)` es lo que hace que esto sea "marcar los pendientes",
 * no "reescribir la fecha de todos": tocar de nuevo un aviso ya leído perdería
 * la fecha real de cuándo se leyó, sin que nadie lo pidiera.
 */
export async function marcarTodosLeidos(): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("notifications")
    .update({ leido_en: new Date().toISOString() })
    .eq("profile_id", user.id)
    .is("leido_en", null);
  if (error) return { error: error.message };

  revalidatePath("/club/avisos");
  return {};
}
