import type { SupabaseClient } from "@supabase/supabase-js";
import { filtroBusqueda, marcadorDesdeBlancas } from "@/lib/partidas/buscar";
import { alcanza, type Rango } from "./rangos";

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

/**
 * Declaración tal como la espera Gemini, y NADA MÁS.
 *
 * El tipo está separado del de abajo porque la API **rechaza la petición entera con
 * un 400** si le llega un campo que no conoce: mandarle nuestro `rango` dentro de la
 * declaración dejaba al asistente sin contestar. Se filtra por rango aquí dentro y
 * se manda solo lo que la API entiende.
 */
export type Declaracion = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

/** Lo que se guarda aquí: la declaración más el rango mínimo para usarla. */
export type Herramienta = Declaracion & { rango: Rango };

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

export const HERRAMIENTAS: Herramienta[] = [
  {
    name: "orden_de_fuerza",
    rango: "jugador",
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
    rango: "jugador",
    description:
      "Los datos del propio socio con el que estás hablando: su número de orden, su ELO oficial y su equipo. Úsalo cuando pregunte por 'mi' algo.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "calendario_interclubs",
    rango: "jugador",
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
    rango: "jugador",
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
    name: "buscar_partidas",
    rango: "jugador",
    description:
      "Repositorio de partidas del club: las que los socios han subido, con fecha, colores, resultado, torneo y apertura. Busca por el nombre de un socio o de un rival. Úsalo siempre que pregunten por las partidas de alguien; NO digas que no tienes partidas sin haberlo consultado antes.",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description:
            "Parte del nombre de un socio o de un rival. Si se omite, devuelve las últimas partidas subidas al club.",
        },
        limite: { type: "number", description: "Cuántas partidas como máximo. Por defecto 6; sube hasta 15 solo si te piden la lista entera." },
      },
    },
  },
  {
    name: "ranking_del_club",
    rango: "jugador",
    description:
      "Ranking de ELO INTERNO del club, el que sale solo de los torneos que organiza el club. No confundir con el orden de fuerza oficial de la FACV.",
    parameters: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántas filas como máximo. Por defecto 6, que es lo que cabe en un chat; sube hasta 15 solo si te piden la lista entera." },
      },
    },
  },
  {
    name: "solicitudes_de_alta",
    rango: "junta",
    description:
      "Solicitudes de vinculación pendientes: socios que se han creado cuenta y esperan que se les apruebe la ficha. Solo para junta y administración.",
    parameters: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántas como máximo. Por defecto 6." },
      },
    },
  },
];

/** Las que se le enseñan al modelo según quién pregunta, ya sin el `rango`, que la
 *  API no admite. */
export function declaracionesPara(rango: Rango): Declaracion[] {
  return HERRAMIENTAS.filter((h) => alcanza(rango, h.rango)).map((h) => ({
    name: h.name,
    description: h.description,
    parameters: h.parameters,
  }));
}

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
  playerId: string | null,
  rango: Rango
): Promise<unknown> {
  // SE VUELVE A COMPROBAR AQUÍ, aunque las herramientas ya se filtren antes de
  // enseñárselas al modelo: una lista que se filtra en un sitio y se obedece en
  // otro se acaba desincronizando, y el día que pase no puede colarse nada.
  const declarada = HERRAMIENTAS.find((h) => h.name === nombre);
  if (declarada && !alcanza(rango, declarada.rango)) {
    return { error: "Eso no le corresponde a esta persona. No se lo cuentes." };
  }

  switch (nombre) {
    case "solicitudes_de_alta": {
      const { data, error } = await supabase
        .from("link_requests")
        .select("created_at, players(nombre)")
        .eq("status", "pendiente")
        .order("created_at")
        .limit(limite(args));
      if (error) return { error: "No se han podido leer las solicitudes." };
      return {
        solicitudes: (data ?? []).map((s) => ({
          ficha: (s.players as unknown as { nombre: string } | null)?.nombre ?? "—",
          pedidaEl: s.created_at,
        })),
      };
    }

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

    case "buscar_partidas": {
      const buscado = typeof args.nombre === "string" ? args.nombre.trim() : "";
      let consulta = supabase
        .from("games")
        .select(
          "fecha, ronda, rival_nombre, mi_elo, rival_elo, color, resultado, apertura, pgn, torneo_texto, players!games_player_id_fkey(nombre), tournaments(nombre)"
        )
        .order("fecha", { ascending: false })
        .limit(limite(args));

      if (buscado) {
        // Los socios que cuadran se resuelven APARTE, y luego se filtra por
        // `player_id`. Filtrar por la tabla incrustada dentro de un `or()` es lo que
        // rompía la búsqueda de la pantalla: ver `src/lib/partidas/buscar.ts`.
        const { data: socios } = await supabase
          .from("players")
          .select("id")
          .ilike("nombre", `%${buscado}%`);
        consulta = consulta.or(
          filtroBusqueda(buscado, (socios ?? []).map((s) => s.id as string))
        );
      }

      const { data, error } = await consulta;
      if (error) return { error: "No se ha podido leer el repositorio de partidas." };
      if ((data ?? []).length === 0) {
        return {
          partidas: [],
          aviso: buscado
            ? `Nadie ha subido todavía ninguna partida que cuadre con "${buscado}".`
            : "Todavía no hay ninguna partida subida al club.",
        };
      }
      return {
        partidas: (data ?? []).map((g) => {
          const duenio =
            (g.players as unknown as { nombre: string } | null)?.nombre ?? "Socio";
          const conBlancas = g.color === "blancas";
          return {
            fecha: g.fecha,
            blancas: conBlancas ? duenio : g.rival_nombre,
            negras: conBlancas ? g.rival_nombre : duenio,
            // Desde las blancas, que es como se lee un resultado.
            resultado: marcadorDesdeBlancas(
              g.resultado as "1" | "0.5" | "0",
              g.color as "blancas" | "negras"
            ),
            torneo:
              (g.tournaments as unknown as { nombre: string } | null)?.nombre ??
              g.torneo_texto,
            ronda: g.ronda,
            apertura: g.apertura,
            tieneJugadas: Boolean(g.pgn),
          };
        }),
      };
    }

    case "ranking_del_club": {
      const { leerRanking } = await import(
        "@/app/club/(vinculado)/jugar/torneos/datos"
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
