"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { sincronizarCalendarioFACVCore } from "@/lib/import/facv-calendario-apply";
import { sincronizarResultadosFACVCore, type ResultadoSyncResultados } from "@/lib/import/facv-resultados-apply";
import { offsetMadrid } from "@/lib/import/facv-calendario";

type Resultado = { ok?: string; error?: string };

const MARGENES_VALIDOS = ["", "100", "200"] as const;

/** Da de alta un equipo en la temporada activa. */
export async function crearEquipo(formData: FormData): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el admin puede hacer esto" };

  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "").trim();
  const margenRaw = String(formData.get("margen_elo") ?? "");
  const numTablerosRaw = String(formData.get("num_tableros") ?? "");

  if (!nombre) return { error: "El nombre del equipo no puede estar vacío" };
  if (!categoria) return { error: "La categoría no puede estar vacía" };
  if (!MARGENES_VALIDOS.includes(margenRaw as (typeof MARGENES_VALIDOS)[number])) {
    return { error: "Margen de ELO no válido" };
  }
  const margenElo = margenRaw === "" ? null : Number(margenRaw);

  const numTableros = Number(numTablerosRaw);
  if (!Number.isInteger(numTableros) || numTableros < 1) {
    return { error: "Número de tableros no válido" };
  }

  const admin = createAdminClient();
  const { data: season } = await admin
    .from("seasons").select("id").eq("activa", true).maybeSingle();
  if (!season) {
    return { error: "No hay temporada activa. Créala primero desde Orden de fuerza." };
  }

  const { error } = await admin.from("teams").insert({
    season_id: season.id,
    nombre,
    categoria,
    margen_elo: margenElo,
    num_tableros: numTableros,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un equipo con ese nombre en esta temporada" };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/equipos");
  return { ok: `Equipo "${nombre}" creado` };
}

/** Elimina un equipo, salvo que ya tenga jornadas creadas. */
export async function eliminarEquipo(teamId: string): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el admin puede hacer esto" };
  const admin = createAdminClient();

  const { count, error: countErr } = await admin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if (countErr) return { error: countErr.message };
  if (count && count > 0) {
    return { error: "No se puede eliminar un equipo que ya tiene jornadas creadas" };
  }

  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) return { error: error.message };
  revalidatePath("/admin/equipos");
  return { ok: "Equipo eliminado" };
}

/** Nombra a una ficha capitana de un equipo. */
export async function nombrarCapitan(teamId: string, playerId: string): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el admin puede hacer esto" };
  if (!playerId) return { error: "Selecciona una ficha" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_captains").insert({ team_id: teamId, player_id: playerId });
  if (error) {
    if (error.code === "23505") return { error: "Esa ficha ya es capitana de este equipo" };
    return { error: error.message };
  }
  revalidatePath("/admin/equipos");
  return { ok: "Capitán nombrado" };
}

/** Retira a una ficha de capitán de un equipo. */
export async function quitarCapitan(teamId: string, playerId: string): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el admin puede hacer esto" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_captains").delete().eq("team_id", teamId).eq("player_id", playerId);
  if (error) return { error: error.message };
  revalidatePath("/admin/equipos");
  return { ok: "Capitán retirado" };
}

/**
 * Descarga el calendario público de Interclubs FACV y sincroniza las
 * jornadas (`matches`) de cada equipo A/B/C de la temporada activa.
 * Acción de servidor gateada por sesión admin.
 */
export async function sincronizarCalendarioFACV(): Promise<{
  creadas: number;
  actualizadas: number;
  omitidas: number;
  respetados: number;
  porEquipo?: Record<string, number>;
  error?: string;
}> {
  if (!(await esAdmin())) {
    return {
      creadas: 0, actualizadas: 0, omitidas: 0, respetados: 0,
      error: "Solo el admin puede hacer esto",
    };
  }
  const resultado = await sincronizarCalendarioFACVCore();
  if (!resultado.error) revalidatePath("/admin/equipos");
  return resultado;
}

/**
 * Descarga marcadores y clasificación de la FACV (misma página del
 * calendario + los enlaces de chess-results que enlaza por grupo) y
 * sincroniza `matches`/`standings` de la temporada activa. Acción de
 * servidor gateada por sesión admin (ver `sincronizarResultadosFACVCore`
 * para el detalle de qué respeta y qué sobreescribe).
 */
export async function sincronizarResultadosFACV(): Promise<ResultadoSyncResultados> {
  if (!(await esAdmin())) {
    return {
      actualizados: 0, omitidos: 0, standingsActualizados: 0, discrepancias: [], avisos: [], errores: [],
      error: "Solo el admin puede hacer esto",
    };
  }
  const resultado = await sincronizarResultadosFACVCore();
  if (!resultado.error) {
    revalidatePath("/admin/equipos");
    revalidatePath("/equipos");
  }
  return resultado;
}

/** Da de alta manualmente una jornada de un equipo (respaldo del importador FACV). */
export async function crearJornada(formData: FormData): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el admin puede hacer esto" };

  const teamId = String(formData.get("team_id") ?? "");
  const rondaRaw = String(formData.get("ronda") ?? "");
  const fechaRaw = String(formData.get("fecha") ?? "").trim();
  const rival = String(formData.get("rival") ?? "").trim();
  const esLocalRaw = String(formData.get("es_local") ?? "");
  const sede = String(formData.get("sede") ?? "").trim();

  if (!teamId) return { error: "Selecciona un equipo" };
  const ronda = Number(rondaRaw);
  if (!Number.isInteger(ronda) || ronda < 1) return { error: "Ronda no válida" };
  if (!rival) return { error: "El rival no puede estar vacío" };
  if (esLocalRaw !== "true" && esLocalRaw !== "false") {
    return { error: "Indica si el equipo juega como local o visitante" };
  }

  // El input datetime-local llega en hora local de Madrid sin zona horaria;
  // se le añade el offset correspondiente antes de guardarlo en la columna
  // timestamptz (mismo criterio que la sincronización FACV).
  const fechaHora = fechaRaw ? `${fechaRaw}${offsetMadrid(fechaRaw)}` : null;

  const admin = createAdminClient();
  const { error } = await admin.from("matches").insert({
    team_id: teamId,
    ronda,
    fecha_hora: fechaHora,
    rival,
    es_local: esLocalRaw === "true",
    sede: sede || null,
    // estado se deja al valor por defecto de la columna ('pendiente'): la
    // sincronización de resultados jugados es responsabilidad de otra tarea.
  });
  if (error) {
    if (error.code === "23505") return { error: "Ese equipo ya tiene una jornada en esa ronda" };
    return { error: error.message };
  }
  revalidatePath("/admin/equipos");
  return { ok: `Jornada ${ronda} creada` };
}
