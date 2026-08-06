import { createAdminClient } from "@/lib/supabase/admin";
import {
  claveFACV,
  parseCalendarioTorneosFACV,
  URL_CALENDARIO_TORNEOS,
} from "@/lib/import/facv-calendario-torneos";
import { fetchConLimite, LIMITE_PAGINA_GRANDE_MS } from "@/lib/import/red";

export type ResumenSyncTorneos = {
  creados: number;
  actualizados: number;
  error?: string;
};

/**
 * Lógica interna (sin gate de autorización) que descarga el calendario oficial
 * de torneos de la FACV, lo parsea y sincroniza la tabla `tournaments`.
 *
 * Qué toca y qué NO toca, que es lo importante de este fichero:
 *
 * - **Crea** los torneos que no existan, con `origen = 'facv'` y
 *   `de_interes = false`: el admin decide después a cuáles va el club. Volcar
 *   168 torneos al año marcados de interés sería inútil.
 * - **Actualiza** de los que ya existen únicamente `nombre`, `fecha_fin`,
 *   `lugar` y `organizador`, que son los campos que manda la FACV y que puede
 *   corregir de un año para otro.
 * - **Nunca pisa** `hora`, `ritmo`, `info_extra`, `url_bases` ni `de_interes`:
 *   eso lo ha escrito el admin a mano y la FACV no lo publica en ninguna parte,
 *   así que un re-sync que lo sobrescribiera destruiría trabajo irrecuperable.
 * - **Nunca toca** torneos con `origen = 'manual'`, aunque coincidan de nombre y
 *   fecha: los creó el admin y son suyos.
 * - Tampoco toca asistencias ni coches, que cuelgan del torneo por su id.
 *
 * Las jornadas de Interclubs las excluye el parser, no esto: ya viven en
 * `matches` con su propio flujo de disponibilidad y convocatoria.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes que
 * quien invoca es admin (ver `src/app/admin/equipos/actions.ts` como ejemplo).
 */
export async function sincronizarTorneosFACVCore(): Promise<ResumenSyncTorneos> {
  try {
    const admin = createAdminClient();

    const pagina = await fetchConLimite(URL_CALENDARIO_TORNEOS, {
      limiteMs: LIMITE_PAGINA_GRANDE_MS,
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!pagina.ok) {
      return {
        creados: 0,
        actualizados: 0,
        error: `No se pudo descargar el calendario de torneos (HTTP ${pagina.status})`,
      };
    }

    const torneos = parseCalendarioTorneosFACV(await pagina.text());
    if (torneos.length === 0) {
      return {
        creados: 0,
        actualizados: 0,
        error:
          "La página no contiene ningún torneo (¿rediseño de la web FACV?). El alta manual sigue disponible.",
      };
    }

    // Los ya existentes de origen FACV, indexados por su clave, para decidir
    // insert vs. update sin una consulta por torneo.
    const { data: existentes, error: errorLeer } = await admin
      .from("tournaments")
      .select("id, clave_facv, origen")
      .eq("origen", "facv");
    if (errorLeer) return { creados: 0, actualizados: 0, error: errorLeer.message };

    const idPorClave = new Map(
      (existentes ?? [])
        .filter((t): t is { id: string; clave_facv: string; origen: string } => !!t.clave_facv)
        .map((t) => [t.clave_facv, t.id])
    );

    let creados = 0;
    let actualizados = 0;

    for (const t of torneos) {
      const clave = claveFACV(t);
      // Campos que la FACV manda y por tanto puede refrescar. Ni `hora`, ni
      // `ritmo`, ni `info_extra`, ni `url_bases`, ni `de_interes` aparecen aquí:
      // ver la explicación de arriba.
      const camposFACV = {
        nombre: t.nombre,
        fecha_fin: t.fechaFin,
        lugar: t.lugar,
        organizador: t.organizador,
      };

      const idExistente = idPorClave.get(clave);
      if (idExistente) {
        const { error } = await admin
          .from("tournaments")
          .update(camposFACV)
          .eq("id", idExistente);
        if (error) return { creados, actualizados, error: error.message };
        actualizados++;
      } else {
        const { error } = await admin.from("tournaments").insert({
          ...camposFACV,
          fecha_inicio: t.fechaInicio,
          origen: "facv" as const,
          clave_facv: clave,
          de_interes: false,
        });
        if (error) {
          // 23505 = clave duplicada. El parser ya devuelve cada torneo una sola
          // vez, así que aquí solo puede pasar si el admin creó a mano un torneo
          // que luego apareció en el calendario oficial: se deja el suyo en paz
          // y se sigue, en vez de abortar toda la sincronización.
          if (error.code === "23505") continue;
          return { creados, actualizados, error: error.message };
        }
        creados++;
      }
    }

    return { creados, actualizados };
  } catch {
    return { creados: 0, actualizados: 0, error: "Error al procesar el calendario de torneos FACV" };
  }
}
