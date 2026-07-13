"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerUrlUltimaListaFeda, parseListaFeda } from "@/lib/import/feda";

const URL_PAGINA_ELO_FEDA = "https://feda.org/feda2k16/elo-feda/";

/**
 * Descarga la página oficial de listas ELO FEDA, localiza el enlace .xlsx
 * más reciente y aplica esa lista a los jugadores del club.
 * Solo debe invocarse desde el cron (con CRON_SECRET) o desde páginas bajo
 * el guard de /admin.
 */
export async function actualizarEloFeda(): Promise<{
  actualizados: number;
  error?: string;
}> {
  const pagina = await fetch(URL_PAGINA_ELO_FEDA, {
    headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
  });
  const url = obtenerUrlUltimaListaFeda(await pagina.text());
  if (!url) return { actualizados: 0, error: "No se encontró la lista FEDA" };
  const fichero = await fetch(url);
  return aplicarListaFeda(await fichero.arrayBuffer());
}

/** Aplica una lista FEDA (xlsx) ya descargada/subida a los jugadores del club. */
export async function aplicarListaFeda(
  buffer: ArrayBuffer
): Promise<{ actualizados: number; error?: string }> {
  const mapa = parseListaFeda(buffer);
  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players").select("id, feda_id").not("feda_id", "is", null);
  let actualizados = 0;
  for (const p of players ?? []) {
    const elo = mapa.get(p.feda_id!);
    if (elo !== undefined) {
      await admin.from("players").update({ elo_feda: elo }).eq("id", p.id);
      actualizados++;
    }
  }
  return { actualizados };
}
