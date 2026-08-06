"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { eloInicial } from "@/lib/club/elo";
import {
  calendarioLiguilla,
  emparejarSuizo,
  rondasRecomendadas,
} from "@/lib/club/emparejar";
import { estadoParaEmparejar, rondaCompleta } from "@/lib/club/clasificacion";
import { leerTorneo } from "./datos";

type Resultado = { error?: string; id?: string };

function refrescar(id?: string): void {
  revalidatePath("/club/interno");
  revalidatePath("/club/interno/ranking");
  if (id) revalidatePath(`/club/interno/${id}`);
}

/** Crea un torneo interno. Lo organizan junta y admin. */
export async function crearTorneoInterno(datos: {
  nombre: string;
  sistema: string;
  fechaInicio?: string;
  notas?: string;
}): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const nombre = datos.nombre.trim();
  if (!nombre) return { error: "Ponle un nombre al torneo." };
  if (datos.sistema !== "liguilla" && datos.sistema !== "suizo") {
    return { error: "Elige el sistema de juego." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("club_tournaments")
    .insert({
      nombre,
      sistema: datos.sistema,
      fecha_inicio: datos.fechaInicio?.trim() || null,
      notas: datos.notas?.trim() || null,
      creado_por: sesion.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  refrescar();
  return { id: data.id };
}

/**
 * Inscribe o quita a un jugador.
 *
 * Al inscribirse se guarda una foto de su ELO de partida, que sale del ELO
 * oficial que tenga. Solo se puede tocar la lista mientras el torneo no ha
 * empezado: cambiar los inscritos con rondas jugadas dejaría el calendario y la
 * clasificación sin sentido.
 */
export async function cambiarInscripcion(
  tournamentId: string,
  playerId: string,
  inscribir: boolean
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const supabase = await createServerSupabase();
  const { data: torneo } = await supabase
    .from("club_tournaments")
    .select("estado")
    .eq("id", tournamentId)
    .single();
  if (torneo?.estado !== "inscripcion") {
    return { error: "El torneo ya ha empezado: no se puede cambiar la lista de inscritos." };
  }

  if (!inscribir) {
    const { error } = await supabase
      .from("club_tournament_players")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId);
    if (error) return { error: error.message };
  } else {
    // El ELO de partida: el oficial más alto que tenga, o el de por defecto.
    const { data: jugador } = await supabase
      .from("players")
      .select("elo_fide, elo_feda, elo_otro")
      .eq("id", playerId)
      .single();
    const { data: fo } = await supabase
      .from("force_order")
      .select("elo_oficial, seasons!inner(activa)")
      .eq("player_id", playerId)
      .eq("seasons.activa", true)
      .maybeSingle();

    const elo = eloInicial({
      eloFacv: fo?.elo_oficial ?? null,
      eloFide: jugador?.elo_fide ?? null,
      eloFeda: jugador?.elo_feda ?? null,
    });

    const { error } = await supabase
      .from("club_tournament_players")
      .upsert(
        { tournament_id: tournamentId, player_id: playerId, elo_inicial: elo },
        { onConflict: "tournament_id,player_id" }
      );
    if (error) return { error: error.message };
  }

  refrescar(tournamentId);
  return {};
}

/**
 * Genera la ronda siguiente.
 *
 * En liguilla se calcula el calendario completo la primera vez y se van creando
 * las rondas de ese calendario; en suizo cada ronda se empareja con los
 * resultados de las anteriores, que es lo que hace suizo a un suizo.
 *
 * No deja generar si la ronda anterior tiene partidas sin resultado: emparejar
 * con datos a medias daría un cruce que habría que deshacer.
 */
export async function generarRonda(tournamentId: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const supabase = await createServerSupabase();
  const torneo = await leerTorneo(supabase, tournamentId);
  if (!torneo) return { error: "Ese torneo no existe." };
  if (torneo.estado === "terminado") return { error: "El torneo ya ha terminado." };
  if (torneo.inscritos.length < 2) {
    return { error: "Hacen falta al menos dos inscritos." };
  }

  const ultima = torneo.rondas[torneo.rondas.length - 1];
  if (ultima && !rondaCompleta(ultima)) {
    return { error: `Faltan resultados de la ronda ${ultima.numero}.` };
  }

  const numero = torneo.rondas.length + 1;
  const fichas = torneo.inscritos.map((i) => i.ficha);

  let emparejamientos: { blancas: string; negras: string }[];
  let descansa: string | null;

  if (torneo.sistema === "liguilla") {
    const calendario = calendarioLiguilla(fichas);
    if (numero > calendario.length) {
      return { error: "La liguilla ya tiene todas sus rondas." };
    }
    const ronda = calendario[numero - 1];
    emparejamientos = ronda.emparejamientos;
    descansa = ronda.descansa;
  } else {
    const tope = torneo.rondasTotales ?? rondasRecomendadas(fichas.length);
    if (numero > tope) return { error: `Este suizo es de ${tope} rondas.` };
    const estado = estadoParaEmparejar(torneo.rondas, torneo.inscritos);
    const ronda = emparejarSuizo(estado, numero);
    emparejamientos = ronda.emparejamientos;
    descansa = ronda.descansa;
  }

  const { data: rondaCreada, error: errorRonda } = await supabase
    .from("club_rounds")
    .insert({ tournament_id: tournamentId, numero, descansa_id: descansa })
    .select("id")
    .single();
  if (errorRonda) return { error: errorRonda.message };

  const { error: errorPares } = await supabase.from("club_pairings").insert(
    emparejamientos.map((e, i) => ({
      round_id: rondaCreada.id,
      mesa: i + 1,
      blancas_id: e.blancas,
      negras_id: e.negras,
    }))
  );
  if (errorPares) return { error: errorPares.message };

  // La primera ronda arranca el torneo, y a partir de ahí la lista de inscritos
  // queda cerrada.
  if (torneo.estado === "inscripcion") {
    await supabase
      .from("club_tournaments")
      .update({
        estado: "en_curso",
        rondas_totales:
          torneo.sistema === "liguilla"
            ? calendarioLiguilla(fichas).length
            : (torneo.rondasTotales ?? rondasRecomendadas(fichas.length)),
      })
      .eq("id", tournamentId);
  }

  refrescar(tournamentId);
  return {};
}

/** Anota (o corrige) el resultado de una partida. */
export async function anotarResultado(
  tournamentId: string,
  pairingId: string,
  resultado: "1" | "0.5" | "0" | null
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("club_pairings")
    .update({ resultado })
    .eq("id", pairingId);
  if (error) return { error: error.message };

  refrescar(tournamentId);
  return {};
}

/** Borra la última ronda, para deshacer un emparejamiento que no valía. */
export async function borrarUltimaRonda(tournamentId: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const supabase = await createServerSupabase();
  const { data: ultima } = await supabase
    .from("club_rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima) return { error: "No hay ninguna ronda que borrar." };

  // Los emparejamientos caen en cascada con la ronda.
  const { error } = await supabase.from("club_rounds").delete().eq("id", ultima.id);
  if (error) return { error: error.message };

  // Si no queda ninguna ronda, el torneo vuelve a admitir inscripciones.
  const { count } = await supabase
    .from("club_rounds")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  if ((count ?? 0) === 0) {
    await supabase
      .from("club_tournaments")
      .update({ estado: "inscripcion" })
      .eq("id", tournamentId);
  }

  refrescar(tournamentId);
  return {};
}

/** Cierra el torneo. Se puede reabrir por si se cerró antes de tiempo. */
export async function cambiarEstadoTorneo(
  tournamentId: string,
  estado: "en_curso" | "terminado"
): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("club_tournaments")
    .update({ estado })
    .eq("id", tournamentId);
  if (error) return { error: error.message };

  refrescar(tournamentId);
  return {};
}
