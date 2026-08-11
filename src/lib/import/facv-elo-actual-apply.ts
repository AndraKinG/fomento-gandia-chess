import { createAdminClient } from "@/lib/supabase/admin";
import { buscarFicha, indicePorNombre } from "@/lib/import/cruzar-nombres";
import {
  CUERPO_FILTRO_CLUB,
  parseEloActualFACV,
  URL_RANKING_FACV,
} from "@/lib/import/facv-elo-actual";
import { fetchConLimite } from "@/lib/import/red";

/**
 * Descarga el ranking FACV filtrado por el club y actualiza `players.elo_fide`
 * con el FIDE de clásicas AL DÍA de cada socio (ver facv-elo-actual.ts: por qué
 * esta fuente y no fide.com, que bloquea a Vercel).
 *
 * SE GUARDA EN `elo_fide` porque ES el FIDE de clásicas — verificado contra
 * perfiles reales —, no un rating distinto que necesite columna propia.
 *
 * Quien no sale en el ranking no se toca: no tiene ELO de clásicas todavía, y
 * poner null pisaría un dato bueno si algún día la página fallara a medias.
 */
export async function actualizarEloActualCore(): Promise<{
  actualizados: number;
  sinCruzar: string[];
  error?: string;
}> {
  try {
    const pagina = await fetchConLimite(URL_RANKING_FACV, {
      metodo: "POST",
      cuerpo: CUERPO_FILTRO_CLUB,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    if (!pagina.ok) {
      return {
        actualizados: 0,
        sinCruzar: [],
        error: `El ranking FACV devolvió HTTP ${pagina.status}`,
      };
    }

    const filas = parseEloActualFACV(await pagina.text());
    if (filas.length === 0) {
      return {
        actualizados: 0,
        sinCruzar: [],
        error: "El ranking FACV no trae ninguna fila del club (¿rediseño de la web?)",
      };
    }

    const admin = createAdminClient();
    const { data: players } = await admin.from("players").select("id, nombre, alias, elo_fide");
    const indice = indicePorNombre(
      (players ?? []).map((p) => ({
        id: p.id as string,
        nombre: p.nombre as string,
        alias: p.alias as string | null,
      }))
    );
    const eloGuardado = new Map((players ?? []).map((p) => [p.id as string, p.elo_fide as number | null]));

    let actualizados = 0;
    const sinCruzar: string[] = [];
    for (const fila of filas) {
      const ficha = buscarFicha(fila.nombre, indice);
      if (!ficha) {
        sinCruzar.push(fila.nombre);
        continue;
      }
      if (eloGuardado.get(ficha) === fila.elo) continue; // sin cambio, sin escritura
      const { error } = await admin.from("players").update({ elo_fide: fila.elo }).eq("id", ficha);
      if (!error) actualizados++;
    }

    return { actualizados, sinCruzar };
  } catch {
    return {
      actualizados: 0,
      sinCruzar: [],
      error: "No se pudo descargar el ranking FACV (tiempo de espera o red)",
    };
  }
}
