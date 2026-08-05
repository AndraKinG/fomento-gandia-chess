"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { crearCuentaConCodigo } from "@/lib/acceso/registro";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: "Email o contraseña incorrectos" };
  redirect("/");
}

/**
 * Alta de socio. El registro abierto está desactivado en Supabase, así que la
 * cuenta la crea el servidor con la clave de servicio tras validar el código
 * del club (ver `src/lib/acceso/registro.ts` para el porqué).
 *
 * Al crearse ya confirmada, se inicia sesión acto seguido y el socio entra
 * directo a elegir su ficha, sin pasar por el email.
 */
export async function registro(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const codigo = String(formData.get("codigo") ?? "");

  // Detrás de Vercel la IP real viene en x-forwarded-for (primer valor de la
  // cadena de proxies). En local no hay cabecera: se agrupa todo bajo "local",
  // que solo afecta al contador de intentos.
  const cabeceras = await headers();
  const ip =
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabeceras.get("x-real-ip") ||
    "local";

  const resultado = await crearCuentaConCodigo(email, password, codigo, ip);
  if (!resultado.ok) return { error: resultado.error };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // La cuenta ya existe; si el inicio de sesión falla por lo que sea, que entre
  // por /login en vez de quedarse mirando un error sin salida.
  if (error) redirect("/login?registrado=1");
  redirect("/club/vincular");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
