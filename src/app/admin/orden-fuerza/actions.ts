"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { parseOrdenFuerza } from "@/lib/import/orden-fuerza-parser";
import { sincronizarOrdenFuerzaFACVCore } from "@/lib/import/facv-of-apply";

/**
 * Descarga la página pública del orden de fuerza oficial FACV del club y la
 * sincroniza con `force_order` de la temporada activa.
 * Acción de servidor gateada por sesión admin.
 */
export async function sincronizarOrdenFuerzaFACV(): Promise<{
  creados: number;
  actualizados: number;
  avisos?: string[];
  error?: string;
}> {
  if (!(await esAdmin())) {
    return { creados: 0, actualizados: 0, error: "Solo el admin puede hacer esto" };
  }
  const resultado = await sincronizarOrdenFuerzaFACVCore();
  if (!resultado.error) revalidatePath("/admin/orden-fuerza");
  return resultado;
}

export async function importarOrdenFuerza(
  seasonNombre: string,
  texto: string
): Promise<{ ok?: string; error?: string }> {
  if (!(await esAdmin())) return { error: "Solo el admin puede importar" };

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
    } else {
      // Sin fide_id/feda_id: buscar por nombre exacto para no duplicar el
      // jugador si esta importación es un reintento tras un fallo previo.
      const { data: existing } = await admin
        .from("players").select("id").eq("nombre", fila.nombre).maybeSingle();
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
  // revierte manualmente el alta de la temporada y se restauran las
  // temporadas que estaban activas antes de empezar.
  const { data: previamenteActivas } = await admin
    .from("seasons").select("id").eq("activa", true);

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
    const idsPrevios = (previamenteActivas ?? []).map((s) => s.id);
    if (idsPrevios.length > 0) {
      await admin.from("seasons").update({ activa: true }).in("id", idsPrevios);
    }
    return { error: orderErr.message };
  }

  revalidatePath("/admin/orden-fuerza");
  return { ok: `Importados ${filas.length} jugadores en "${seasonNombre}"` };
}
