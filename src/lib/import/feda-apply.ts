import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerUrlUltimaListaFeda, parseListaFeda } from "@/lib/import/feda";
import { fetchConLimite, LIMITE_FICHERO_MS } from "@/lib/import/red";

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
  sinFicha?: number;
  /** Nombre del fichero aplicado, para poder decir de qué mes es la lista. */
  lista?: string;
  error?: string;
}> {
  try {
    const pagina = await fetchConLimite(URL_PAGINA_ELO_FEDA, {
      headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
    });
    if (!pagina.ok) {
      return {
        actualizados: 0,
        error: `No se pudo descargar la lista FEDA (HTTP ${pagina.status})`,
      };
    }
    const url = obtenerUrlUltimaListaFeda(await pagina.text());
    if (!url) return { actualizados: 0, error: "No se encontró la lista FEDA" };
    const fichero = await fetchConLimite(url, { limiteMs: LIMITE_FICHERO_MS });
    if (!fichero.ok) {
      return {
        actualizados: 0,
        error: `No se pudo descargar la lista FEDA (HTTP ${fichero.status})`,
      };
    }
    const resultado = await aplicarListaFedaCore(await fichero.arrayBuffer());
    return { ...resultado, lista: url.split("/").pop() };
  } catch {
    return { actualizados: 0, error: "Error al procesar la lista FEDA" };
  }
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
): Promise<{ actualizados: number; sinFicha: number; error?: string }> {
  try {
    const lista = parseListaFeda(buffer);
    if (lista.porFeda.size === 0) {
      return {
        actualizados: 0,
        sinFicha: 0,
        error: "El fichero no contiene columnas reconocibles (Id. FEDA / Elo)",
      };
    }
    const admin = createAdminClient();
    // Se piden TODAS las fichas, no solo las que tienen `feda_id`: ninguna del club lo
    // tiene, y el cruce de verdad es por `fide_id`.
    const { data: players } = await admin
      .from("players")
      .select("id, fide_id, feda_id");

    let actualizados = 0;
    let sinFicha = 0;
    for (const p of players ?? []) {
      // Por id FEDA si lo tiene, y si no por id FIDE.
      const fila =
        (p.feda_id ? lista.porFeda.get(p.feda_id) : undefined) ??
        (p.fide_id ? lista.porFide.get(p.fide_id) : undefined);
      if (!fila) {
        sinFicha++;
        continue;
      }
      // Se aprovecha para guardar el `feda_id` que faltaba: a partir de la próxima vez
      // el cruce ya no depende de que la lista traiga el id FIDE.
      const cambios: { elo_feda: number; feda_id?: string } = { elo_feda: fila.elo };
      if (!p.feda_id) cambios.feda_id = fila.fedaId;
      await admin.from("players").update(cambios).eq("id", p.id);
      actualizados++;
    }
    return { actualizados, sinFicha };
  } catch {
    return { actualizados: 0, sinFicha: 0, error: "Error al procesar la lista FEDA" };
  }
}
