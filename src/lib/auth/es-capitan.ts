import { createServerSupabase } from "@/lib/supabase/server";

/**
 * true si el usuario autenticado en la sesión actual es capitán del equipo
 * de la jornada `matchId`. Llama a la RPC `es_capitan_de_match` (migración
 * 0005) con el cliente de USUARIO (no admin): la función es `security
 * definer`, pero internamente compara contra `auth.uid()`, por lo que debe
 * evaluarse con el cliente autenticado de la sesión del LLAMANTE — con el
 * cliente admin (sin sesión) siempre devolvería false.
 */
export async function esCapitanDeMatch(matchId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("es_capitan_de_match", { encuentro: matchId });
  if (error) return false;
  return Boolean(data);
}
