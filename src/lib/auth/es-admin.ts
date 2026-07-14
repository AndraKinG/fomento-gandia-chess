import { createServerSupabase } from "@/lib/supabase/server";

/** true si el usuario autenticado en la sesión actual es admin. */
export async function esAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  return Boolean(profile?.is_admin);
}
