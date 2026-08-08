import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lo que el asistente puede consultar de la base.
 *
 * REGLA DE ORO: TODO va con el cliente de la SESIÓN del socio, nunca con la clave
 * de servicio. Así las mismas políticas de RLS que protegen las pantallas protegen
 * al asistente, y no hay forma de que le cuente a un socio algo que no vería
 * entrando él. Un asistente con clave de servicio sería una puerta trasera a toda
 * la base con una frase bien puesta.
 *
 * Todo es de LECTURA. El asistente no escribe nada: para inscribirse, publicar una
 * convocatoria o cambiar un dato están las pantallas, que ya validan permisos.
 */

type Cliente = SupabaseClient;

/** Declaración de una herramienta, en el formato que espera Gemini. */
export type Declaracion = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

/** Techo duro de filas por consulta. Meter 46 filas en la conversación por cada
 *  pregunta gasta la cuota gratuita a lo tonto. */
const TOPE = 15;

/**
 * Filas cuando no se pide un número.
 *
 * SEIS Y NO EL TECHO, y esto salió de verlo en producción: a "¿qué torneos hay
 * pronto?" contestó con quince, uno por línea, y eso en un chat es un muro que
 * nadie lee. Si el socio quiere la lista entera, el modelo pide más.
 */
const POR_DEFECTO = 6;

function limite(args: Record<string, unknown>): number {
  const n = Number(args.limite);
  return Number.isFinite(n) && n > 0 ? Math.min(n, TOPE) : POR_DEFECTO;
}

export const DECLARACIONES: Declaracion[] = [
  {
    name: "orden_de_fuerza",
    description:
      "Orden de fuerza oficial de la FACV para la temporada en curso: número de orden, nombre y ELO oficial de cada socio. Es el que manda en las convocatorias del Interclubs. Úsalo para saber quién es más fuerte, en qué tablero juega alguien o cuál es el ELO de un socio.",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Parte del nombre de un socio, para buscarlo. Si se omite, devuelve los primeros del orden.",
        },
        limite: { type: "number", description: "Cuántas filas como máximo. Por defecto 6, que es lo que cabe en un chat; sube hasta 15 solo si te piden la lista entera." },
      },
    },
  },
  {
    name: "mi_ficha",
    description:
      "Los datos del propio socio con el que estás hablando: su número de orden, su ELO oficial y su equipo. Úsalo cuando pregunte por 'mi' algo.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "calendario_interclubs",
    description:
      "Jornadas del Interclubs de los equipos del club en la temporada en curso: ronda, rival, si se juega en casa, fecha y marcador si ya se jugó. Úsalo para la próxima jornada, el calendario o cómo fue un encuentro.",
    parameters: {
      type: "object",
      properties: {
        solo_proximas: {
          type: "boolean",
          description: "true para devolver solo las que aún no se han jugado.",
        },
        limite: { type: "number", description: "Cuántas jornadas como máximo. Por defecto 6; sube hasta 15 solo si te piden el calendario entero." },
      },
    },
  },
  {
    name: "proximos_torneos",
    description:
      "Torneos de fuera del club (calendario de la FACV y los que añade el club) que todavía no se han jugado: nombre, fechas, lugar y ritmo. Úsalo para saber a qué se puede ir a jugar.",
    parameters: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántos torneos como máximo. Por defecto 6, que es lo que cabe en un chat; sube hasta 15 solo si te piden la lista entera." },
      },
    },
  },
  {
    name: "ranking_del_club",
    description:
      "Ranking de ELO INTERNO del club, el que sale solo de los torneos que organiza el club. No confundir con el orden de fuerza oficial de la FACV.",
    parameters: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántas filas como máximo. Por defecto 6, que es lo que cabe en un chat; sube hasta 15 solo si te piden la lista entera." },
      },
    },
  },
];

/** Nombre de la temporada activa y su id, que hace falta para casi todo. */
async function temporadaActiva(supabase: Cliente) {
  const { data } = await supabase
    .from("seasons")
    .select("id, nombre")
    .eq("activa", true)
    .maybeSingle();
  return data as { id: string; nombre: string } | null;
}

/**
 * Ejecuta una herramienta y devuelve datos planos, ya en castellano.
 *
 * Se devuelven NOMBRES DE CAMPO EN CASTELLANO y no las columnas de la base: el
 * modelo se los va a leer al socio, y `marcador_propio` en una respuesta queda
 * como lo que es, una fuga de la base de datos.
 */
export async function ejecutar(
  nombre: string,
  args: Record<string, unknown>,
  supabase: Cliente,
  playerId: string | null
): Promise<unknown> {
  switch (nombre) {
    case "orden_de_fuerza": {
      const season = await temporadaActiva(supabase);
      if (!season) return { error: "No hay ninguna temporada activa." };
      let consulta = supabase
        .from("force_order")
        .select("numero, bis_index, elo_oficial, players(nombre)")
        .eq("season_id", season.id)
        .order("numero")
        .order("bis_index")
        .limit(limite(args));
      const buscado = typeof args.nombre === "string" ? args.nombre.trim() : "";
      if (buscado) {
        // Se filtra por la tabla incrustada, que aquí SÍ se puede porque no va
        // dentro de un `or()` — ese es el caso que rompía la búsqueda de partidas.
        consulta = consulta.ilike("players.nombre", `%${buscado}%`).not("players", "is", null);
      }
      const { data, error } = await consulta;
      if (error) return { error: "No se ha podido leer el orden de fuerza." };
      return {
        temporada: season.nombre,
        jugadores: (data ?? []).map((f) => ({
          numero: f.bis_index > 0 ? `${f.numero} bis` : String(f.numero),
          nombre: (f.players as unknown as { nombre: string } | null)?.nombre ?? "—",
          elo: f.elo_oficial ?? null,
        })),
      };
    }

    case "mi_ficha": {
      if (!playerId) {
        return { aviso: "Esta persona todavía no tiene ficha del club aprobada." };
      }
      const season = await temporadaActiva(supabase);
      const [{ data: ficha }, { data: orden }] = await Promise.all([
        supabase.from("players").select("nombre").eq("id", playerId).maybeSingle(),
        season
          ? supabase
              .from("force_order")
              .select("numero, bis_index, elo_oficial")
              .eq("season_id", season.id)
              .eq("player_id", playerId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        nombre: ficha?.nombre ?? null,
        temporada: season?.nombre ?? null,
        numeroDeOrden: orden
          ? orden.bis_index > 0
            ? `${orden.numero} bis`
            : String(orden.numero)
          : null,
        eloOficial: orden?.elo_oficial ?? null,
      };
    }

    case "calendario_interclubs": {
      const season = await temporadaActiva(supabase);
      if (!season) return { error: "No hay ninguna temporada activa." };
      const { data: equipos } = await supabase
        .from("teams")
        .select("id, nombre")
        .eq("season_id", season.id);
      const ids = (equipos ?? []).map((e) => e.id);
      if (ids.length === 0) return { temporada: season.nombre, jornadas: [] };
      const porEquipo = new Map((equipos ?? []).map((e) => [e.id, e.nombre]));

      let consulta = supabase
        .from("matches")
        .select("team_id, ronda, rival, es_local, fecha_hora, marcador_propio, marcador_rival")
        .in("team_id", ids)
        .order("fecha_hora")
        .limit(limite(args));
      if (args.solo_proximas === true) {
        consulta = consulta.gte("fecha_hora", new Date().toISOString());
      }
      const { data, error } = await consulta;
      if (error) return { error: "No se ha podido leer el calendario." };
      return {
        temporada: season.nombre,
        jornadas: (data ?? []).map((j) => ({
          equipo: porEquipo.get(j.team_id) ?? "—",
          ronda: j.ronda,
          rival: j.rival,
          donde: j.es_local ? "en casa" : "fuera",
          fecha: j.fecha_hora,
          marcador:
            j.marcador_propio === null || j.marcador_rival === null
              ? null
              : `${j.marcador_propio}-${j.marcador_rival}`,
        })),
      };
    }

    case "proximos_torneos": {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tournaments")
        .select("nombre, fecha_inicio, fecha_fin, lugar, hora, ritmo")
        .gte("fecha_inicio", hoy)
        .order("fecha_inicio")
        .limit(limite(args));
      if (error) return { error: "No se ha podido leer el calendario de torneos." };
      return {
        torneos: (data ?? []).map((t) => ({
          nombre: t.nombre,
          empieza: t.fecha_inicio,
          acaba: t.fecha_fin,
          lugar: t.lugar,
          hora: t.hora,
          ritmo: t.ritmo,
        })),
      };
    }

    case "ranking_del_club": {
      const { leerRanking } = await import(
        "@/app/club/(vinculado)/torneos/interno/datos"
      );
      const filas = await leerRanking(supabase);
      return {
        aviso: "Este es el ELO INTERNO del club, no el oficial de la FACV.",
        jugadores: filas.slice(0, limite(args)).map((f, i) => ({
          puesto: i + 1,
          nombre: f.nombre,
          eloDelClub: f.elo,
          partidas: f.partidas,
        })),
      };
    }

    default:
      return { error: `No existe ninguna herramienta llamada ${nombre}.` };
  }
}
