import { createAdminClient } from "@/lib/supabase/admin";
import { normalizaNombre, offsetMadrid, parseCalendarioFACV, URL_CALENDARIO } from "@/lib/import/facv-calendario";

type Sufijo = "A" | "B" | "C";

/**
 * Sufijo de equipo (A/B/C) a partir de un nombre de club/equipo: " B" al
 * final → equipo B, " C" al final → C, cualquier otro caso → A (equipo
 * principal, sin sufijo). Mapeo exacto por sufijo, mismo criterio tanto para
 * los nombres que llegan de la página FACV ("Fomento de Gandía B") como para
 * los nombres de `teams` en la propia base de datos ("Fomento de Gandia B").
 */
function sufijoEquipo(nombre: string): Sufijo {
  const n = normalizaNombre(nombre);
  if (n.endsWith(" b")) return "B";
  if (n.endsWith(" c")) return "C";
  return "A";
}

/**
 * Lógica interna (sin gate de autorización) que descarga la página pública
 * del calendario de Interclubs FACV, la parsea y sincroniza `matches` de
 * cada equipo (A/B/C) de la temporada activa: crea las jornadas que no
 * existan y actualiza rival/es_local/fecha de las que ya estén (upsert por
 * `(team_id, ronda)`). El estado se deja siempre en 'pendiente' — sincronizar
 * el resultado real de una jornada jugada es responsabilidad del importador
 * de resultados (fuera del alcance de esta tarea).
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/admin/equipos/actions.ts`).
 */
export async function sincronizarCalendarioFACVCore(): Promise<{
  creadas: number;
  actualizadas: number;
  omitidas: number;
  porEquipo?: Record<string, number>;
  error?: string;
}> {
  try {
    const admin = createAdminClient();

    const { data: season } = await admin
      .from("seasons").select("id").eq("activa", true).maybeSingle();
    if (!season) {
      return { creadas: 0, actualizadas: 0, omitidas: 0, error: "No hay ninguna temporada activa" };
    }

    const { data: equipos } = await admin
      .from("teams").select("id, nombre").eq("season_id", season.id);
    if (!equipos || equipos.length === 0) {
      return {
        creadas: 0,
        actualizadas: 0,
        omitidas: 0,
        error: "No hay equipos dados de alta en la temporada activa; créalos primero",
      };
    }

    const equipoIdPorSufijo = new Map<Sufijo, { id: string; nombre: string }>();
    for (const eq of equipos) {
      equipoIdPorSufijo.set(sufijoEquipo(eq.nombre), { id: eq.id, nombre: eq.nombre });
    }

    // Nombre base para buscar en la página FACV (sin sufijo " B"/" C"): el del
    // equipo A si existe, o si no el de cualquier otro quitándole el sufijo.
    const equipoA = equipos.find((e) => sufijoEquipo(e.nombre) === "A");
    const nombreBase = equipoA?.nombre ?? equipos[0].nombre.replace(/ [BC]$/i, "");

    const pagina = await fetch(URL_CALENDARIO, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!pagina.ok) {
      return {
        creadas: 0,
        actualizadas: 0,
        omitidas: 0,
        error: `No se pudo descargar el calendario (HTTP ${pagina.status})`,
      };
    }

    const jornadas = parseCalendarioFACV(await pagina.text(), nombreBase);
    if (jornadas.length === 0) {
      return {
        creadas: 0,
        actualizadas: 0,
        omitidas: 0,
        error: "La página no contiene encuentros del club (¿rediseño de la web FACV?)",
      };
    }

    // Jornadas ya existentes de los equipos de la temporada, indexadas por
    // "team_id/ronda" para decidir insert vs. update sin una consulta por fila.
    const idsEquipos = equipos.map((e) => e.id);
    const { data: existentes } = await admin
      .from("matches").select("id, team_id, ronda").in("team_id", idsEquipos);
    const existentePorClave = new Map(
      (existentes ?? []).map((m) => [`${m.team_id}/${m.ronda}`, m.id])
    );

    let creadas = 0;
    let actualizadas = 0;
    let omitidas = 0;
    const porEquipo: Record<string, number> = {};

    for (const j of jornadas) {
      const esLocal = normalizaNombre(j.local).includes(normalizaNombre(nombreBase));
      const nombreEquipoFila = esLocal ? j.local : j.visitante;
      const rival = esLocal ? j.visitante : j.local;
      const equipo = equipoIdPorSufijo.get(sufijoEquipo(nombreEquipoFila));
      if (!equipo) {
        omitidas++; // no hay equipo dado de alta para ese sufijo: se ignora la jornada
        continue;
      }

      // Las fechas de FACV son hora local de Madrid, sin zona horaria: se les
      // añade aquí el offset correspondiente (invierno/verano) para que se
      // guarden correctamente en la columna timestamptz.
      const fechaHora = j.fecha ? `${j.fecha}${offsetMadrid(j.fecha)}` : null;

      const valores = {
        team_id: equipo.id,
        ronda: j.ronda,
        rival,
        es_local: esLocal,
        fecha_hora: fechaHora,
        estado: "pendiente" as const,
      };

      const clave = `${equipo.id}/${j.ronda}`;
      const idExistente = existentePorClave.get(clave);
      if (idExistente) {
        const { error } = await admin.from("matches").update(valores).eq("id", idExistente);
        if (error) return { creadas, actualizadas, omitidas, error: error.message };
        actualizadas++;
      } else {
        const { error } = await admin.from("matches").insert(valores);
        if (error) return { creadas, actualizadas, omitidas, error: error.message };
        creadas++;
      }
      porEquipo[equipo.nombre] = (porEquipo[equipo.nombre] ?? 0) + 1;
    }

    return { creadas, actualizadas, omitidas, porEquipo };
  } catch {
    return { creadas: 0, actualizadas: 0, omitidas: 0, error: "Error al procesar el calendario FACV" };
  }
}
