import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

export type Sesion = {
  userId: string;
  email: string;
  esAdmin: boolean;
  /** null = cuenta creada pero sin ficha del club aprobada todavía. */
  playerId: string | null;
};

/**
 * Sesión y perfil del usuario actual, o null si no hay sesión.
 *
 * Envuelto en `cache()` de React: los dos layouts de la zona de socios
 * (`/club` y el grupo `(vinculado)`) necesitan lo mismo, y sin memoizar serían
 * dos consultas a `profiles` en cada petición. `cache()` la deduplica dentro de
 * una misma petición, no entre peticiones distintas, que es exactamente lo que
 * hace falta aquí.
 */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, player_id")
    .eq("id", user.id)
    .single();

  return {
    userId: user.id,
    email: user.email ?? "",
    esAdmin: Boolean(profile?.is_admin),
    playerId: profile?.player_id ?? null,
  };
});
