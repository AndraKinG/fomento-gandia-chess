"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: "Email o contraseña incorrectos" };
  redirect("/");
}

export async function registro(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) {
    const yaExiste =
      error.code === "user_already_exists" ||
      error.message === "User already registered";
    return {
      error: yaExiste
        ? "Ya existe una cuenta con ese email"
        : "No se pudo crear la cuenta. Revisa el email y la contraseña (mínimo 8 caracteres).",
    };
  }
  redirect("/login?registrado=1");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
