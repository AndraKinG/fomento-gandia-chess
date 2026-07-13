import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerUrlUltimaListaFeda, parseListaFeda } from "@/lib/import/feda";

const URL_PAGINA_ELO_FEDA = "https://feda.org/feda2k16/elo-feda/";

/**
 * Lógica interna (sin gate de autorización) que descarga la página oficial
 * de listas ELO FEDA, localiza el enlace .xlsx más reciente y aplica esa
 * lista a los jugadores del club.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/admin/elo/actions.ts`) o que la
 * petición trae el `CRON_SECRET` válido (ver `src/app/api/cron/elo-feda/route.ts`).
 */
export async function actualizarEloFedaCore(): Promise<{
  actualizados: number;
  error?: string;
}> {
  const pagina = await fetch(URL_PAGINA_ELO_FEDA, {
    headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
  });
  const url = obtenerUrlUltimaListaFeda(await pagina.text());
  if (!url) return { actualizados: 0, error: "No se encontró la lista FEDA" };
  const fichero = await fetch(url);
  return aplicarListaFedaCore(await fichero.arrayBuffer());
}

/**
 * Lógica interna (sin gate de autorización) que aplica una lista FEDA (xlsx)
 * ya descargada/subida a los jugadores del club.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/admin/elo/actions.ts`) o que la
 * petición trae el `CRON_SECRET` válido (ver `src/app/api/cron/elo-feda/route.ts`).
 */
export async function aplicarListaFedaCore(
  buffer: ArrayBuffer
): Promise<{ actualizados: number; error?: string }> {
  const mapa = parseListaFeda(buffer);
  if (mapa.size === 0) {
    return {
      actualizados: 0,
      error: "El fichero no contiene columnas reconocibles (Id. FEDA / Elo)",
    };
  }
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
