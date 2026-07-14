import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrdenFuerzaFACV, URL_OF_CLUB } from "@/lib/import/facv-orden-fuerza";

/**
 * Lógica interna (sin gate de autorización) que descarga la página pública
 * del orden de fuerza oficial FACV del club, la parsea y sincroniza
 * `force_order` de la temporada activa: crea jugadores que no existan,
 * actualiza número/bis/elo_oficial de los que ya estén en la temporada y
 * avisa (sin borrar) de los que ya no aparecen en la página.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/admin/orden-fuerza/actions.ts`).
 */
export async function sincronizarOrdenFuerzaFACVCore(): Promise<{
  creados: number;
  actualizados: number;
  avisos?: string[];
  error?: string;
}> {
  try {
    const pagina = await fetch(URL_OF_CLUB, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!pagina.ok) {
      return {
        creados: 0,
        actualizados: 0,
        error: `No se pudo descargar la página del orden de fuerza (HTTP ${pagina.status})`,
      };
    }

    const filas = parseOrdenFuerzaFACV(await pagina.text());
    if (filas.length === 0) {
      return {
        creados: 0,
        actualizados: 0,
        error: "La página no contiene el orden de fuerza (¿rediseño de la web FACV?)",
      };
    }

    const admin = createAdminClient();

    const { data: season } = await admin
      .from("seasons").select("id").eq("activa", true).maybeSingle();
    if (!season) {
      return {
        creados: 0,
        actualizados: 0,
        error: "No hay ninguna temporada activa; créala primero (importación manual)",
      };
    }

    // Filas ya existentes en force_order de la temporada activa, indexadas por
    // player_id, para poder decidir insert vs. update sin una consulta por fila.
    const { data: existentes } = await admin
      .from("force_order")
      .select("id, player_id, numero, bis_index, elo_oficial, players(nombre)")
      .eq("season_id", season.id);
    const existentesPorJugador = new Map(
      (existentes ?? []).map((e) => [e.player_id as string, e])
    );
    const vistos = new Set<string>();

    let creados = 0;
    let actualizados = 0;

    for (const fila of filas) {
      // a. Resolver el jugador: por fide_id, si no por nombre exacto, si no crearlo.
      let playerId: string | null = null;
      if (fila.fideId) {
        const { data } = await admin
          .from("players").select("id").eq("fide_id", fila.fideId).maybeSingle();
        playerId = data?.id ?? null;
      }
      if (!playerId) {
        const { data } = await admin
          .from("players").select("id").eq("nombre", fila.nombre).maybeSingle();
        playerId = data?.id ?? null;
      }
      if (!playerId) {
        const { data: creado, error: createErr } = await admin
          .from("players")
          .insert({ nombre: fila.nombre, fide_id: fila.fideId })
          .select("id").single();
        if (createErr) {
          return { creados, actualizados, error: `${fila.nombre}: ${createErr.message}` };
        }
        playerId = creado.id;
      }
      // playerId está garantizado no-nulo aquí: o se resolvió arriba o se creó.
      const idJugador = playerId as string;
      vistos.add(idJugador);

      // b. Upsert manual de force_order por (season_id, player_id). Existe además
      // una restricción unique(season_id, numero, bis_index) DEFERRABLE: si el
      // reordenamiento colisiona con la posición de otra fila ya existente,
      // Postgres devuelve 23505. No lo resolvemos automáticamente (implicaría
      // decidir qué fila "gana" la posición): se corta y se pide reimportar
      // tras limpiar el orden anterior.
      const existente = existentesPorJugador.get(idJugador);
      if (existente) {
        const cambia =
          existente.numero !== fila.numero ||
          existente.bis_index !== fila.bisIndex ||
          existente.elo_oficial !== fila.eloOficial;
        if (cambia) {
          const { error: updateErr } = await admin
            .from("force_order")
            .update({
              numero: fila.numero,
              bis_index: fila.bisIndex,
              elo_oficial: fila.eloOficial,
            })
            .eq("id", existente.id);
          if (updateErr) {
            if (updateErr.code === "23505") {
              return {
                creados,
                actualizados,
                error:
                  "Colisión de posiciones al reordenar el orden de fuerza; " +
                  "re-importa tras limpiar el orden anterior",
              };
            }
            return { creados, actualizados, error: updateErr.message };
          }
          actualizados++;
        }
      } else {
        const { error: insertErr } = await admin.from("force_order").insert({
          season_id: season.id,
          player_id: idJugador,
          numero: fila.numero,
          bis_index: fila.bisIndex,
          elo_oficial: fila.eloOficial,
        });
        if (insertErr) {
          if (insertErr.code === "23505") {
            return {
              creados,
              actualizados,
              error:
                "Colisión de posiciones al reordenar el orden de fuerza; " +
                "re-importa tras limpiar el orden anterior",
            };
          }
          return { creados, actualizados, error: insertErr.message };
        }
        creados++;
      }
    }

    // c. Avisar (sin borrar) de las filas de la temporada que ya no aparecen
    // en la página FACV: decisión humana sobre qué hacer con esos jugadores.
    const avisos: string[] = [];
    for (const [playerId, fila] of existentesPorJugador) {
      if (vistos.has(playerId)) continue;
      const jugador = fila.players as unknown as { nombre: string } | null;
      const posicion = `${fila.numero}${fila.bis_index ? "bis" : ""}`;
      avisos.push(
        `${jugador?.nombre ?? "Jugador desconocido"} (nº ${posicion}) ya no aparece en la página FACV`
      );
    }

    return { creados, actualizados, ...(avisos.length ? { avisos } : {}) };
  } catch {
    return { creados: 0, actualizados: 0, error: "Error al procesar el orden de fuerza FACV" };
  }
}
