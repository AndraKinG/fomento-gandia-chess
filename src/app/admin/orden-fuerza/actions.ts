"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrdenFuerza } from "@/lib/import/orden-fuerza-parser";

export async function importarOrdenFuerza(
  seasonNombre: string,
  texto: string
): Promise<{ ok?: string; error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Solo el admin puede importar" };

  const { filas, errores } = parseOrdenFuerza(texto);
  if (errores.length > 0)
    return { error: errores.map((e) => `L${e.linea}: ${e.motivo}`).join(" · ") };
  if (filas.length === 0) return { error: "No hay filas que importar" };

  const admin = createAdminClient();
  const { data: season, error: seasonErr } = await admin
    .from("seasons")
    .insert({ nombre: seasonNombre, activa: true })
    .select("id").single();
  if (seasonErr) return { error: seasonErr.message };

  for (const fila of filas) {
    // Reutiliza ficha existente por fide_id/feda_id; si no, la crea
    let playerId: string | null = null;
    if (fila.fideId || fila.fedaId) {
      const or = [
        fila.fideId ? `fide_id.eq.${fila.fideId}` : null,
        fila.fedaId ? `feda_id.eq.${fila.fedaId}` : null,
      ].filter(Boolean).join(",");
      const { data: existing } = await admin
        .from("players").select("id").or(or).maybeSingle();
      playerId = existing?.id ?? null;
    }
    if (!playerId) {
      const { data: created, error: createErr } = await admin
        .from("players")
        .insert({ nombre: fila.nombre, fide_id: fila.fideId, feda_id: fila.fedaId })
        .select("id").single();
      if (createErr) return { error: `${fila.nombre}: ${createErr.message}` };
      playerId = created.id;
    }
    const { error: orderErr } = await admin.from("force_order").insert({
      season_id: season.id,
      player_id: playerId,
      numero: fila.numero,
      bis_index: fila.bisIndex,
    });
    if (orderErr) return { error: `${fila.nombre}: ${orderErr.message}` };
  }
  revalidatePath("/admin/orden-fuerza");
  return { ok: `Importados ${filas.length} jugadores en "${seasonNombre}"` };
}
