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

  // a. Parsear y validar todo antes de tocar la base de datos.
  const { filas, errores } = parseOrdenFuerza(texto);
  if (errores.length > 0)
    return { error: errores.map((e) => `L${e.linea}: ${e.motivo}`).join(" · ") };
  if (filas.length === 0) return { error: "No hay filas que importar" };

  const admin = createAdminClient();

  // b. Resolver/crear todos los jugadores ANTES de tocar seasons/force_order.
  // Si algo falla aquí, no se ha modificado ninguna temporada.
  const resueltos: { playerId: string; numero: number; bisIndex: number }[] = [];
  for (const fila of filas) {
    let playerId: string | null = null;
    if (fila.fideId || fila.fedaId) {
      // El parser garantiza que fideId/fedaId son numéricos (/^\d+$/) antes de
      // llegar aquí, por lo que la interpolación en el filtro .or() es segura
      // frente a inyección de sintaxis PostgREST.
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
    resueltos.push({
      playerId: playerId as string,
      numero: fila.numero,
      bisIndex: fila.bisIndex,
    });
  }

  // c. Desactivar la temporada activa, crear la nueva e insertar todo el
  // orden de fuerza en una sola llamada. Si el insert masivo falla, se
  // revierte manualmente el alta de la temporada.
  const { error: deactivateErr } = await admin
    .from("seasons").update({ activa: false }).eq("activa", true);
  if (deactivateErr) return { error: deactivateErr.message };

  const { data: season, error: seasonErr } = await admin
    .from("seasons")
    .insert({ nombre: seasonNombre, activa: true })
    .select("id").single();
  if (seasonErr) return { error: seasonErr.message };

  const { error: orderErr } = await admin.from("force_order").insert(
    resueltos.map((r) => ({
      season_id: season.id,
      player_id: r.playerId,
      numero: r.numero,
      bis_index: r.bisIndex,
    }))
  );
  if (orderErr) {
    await admin.from("seasons").delete().eq("id", season.id);
    return { error: orderErr.message };
  }

  revalidatePath("/admin/orden-fuerza");
  return { ok: `Importados ${filas.length} jugadores en "${seasonNombre}"` };
}
