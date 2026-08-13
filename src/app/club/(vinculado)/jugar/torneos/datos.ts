import type { SupabaseClient } from "@supabase/supabase-js";
import type { RondaJugada } from "@/lib/club/clasificacion";
import { recalcular, type PartidaElo } from "@/lib/club/elo";
import { nombreDeFila } from "@/lib/club/nombre-socio";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cliente = SupabaseClient<any, "public", any>;

export type TorneoInterno = {
  id: string;
  nombre: string;
  sistema: "liguilla" | "suizo";
  estado: "inscripcion" | "en_curso" | "terminado";
  rondasTotales: number | null;
  fechaInicio: string | null;
  notas: string | null;
  /** Cuenta que lo creó (0015). null si esa cuenta ya no existe. */
  creadoPor: string | null;
  inscritos: { ficha: string; nombre: string; eloInicial: number }[];
  rondas: (RondaJugada & {
    id: string;
    /** Cuándo se juega la ronda (migración 0037). null = sin hora puesta. */
    fechaHora: string | null;
    pares: { id: string; mesa: number; gameId: string | null }[];
  })[];
};

/**
 * Lee un torneo interno completo: inscritos, rondas y emparejamientos.
 *
 * Compartido por las acciones y las pantallas para que las dos vean exactamente
 * lo mismo. Si la pantalla leyera por su cuenta, podría enseñar una clasificación
 * calculada con datos distintos de los que usó el emparejador.
 */
export async function leerTorneo(
  supabase: Cliente,
  id: string
): Promise<TorneoInterno | null> {
  const { data: t } = await supabase
    .from("club_tournaments")
    .select("id, nombre, sistema, estado, rondas_totales, fecha_inicio, notas, creado_por")
    .eq("id", id)
    .maybeSingle();
  if (!t) return null;

  const [{ data: inscritos }, { data: rondas }] = await Promise.all([
    supabase
      .from("club_tournament_players")
      .select("player_id, elo_inicial, players(nombre, apodo)")
      .eq("tournament_id", id)
      .order("elo_inicial", { ascending: false }),
    supabase
      .from("club_rounds")
      .select("id, numero, descansa_id, fecha_hora")
      .eq("tournament_id", id)
      .order("numero"),
  ]);

  const idsRondas = (rondas ?? []).map((r) => r.id);
  const { data: pares } =
    idsRondas.length > 0
      ? await supabase
          .from("club_pairings")
          .select("id, round_id, mesa, blancas_id, negras_id, resultado, game_id")
          .in("round_id", idsRondas)
          .order("mesa")
      : { data: [] };

  return {
    id: t.id,
    nombre: t.nombre,
    sistema: t.sistema,
    estado: t.estado,
    rondasTotales: t.rondas_totales,
    fechaInicio: t.fecha_inicio,
    notas: t.notas,
    creadoPor: t.creado_por ?? null,
    inscritos: (inscritos ?? []).map((i) => ({
      ficha: i.player_id,
      nombre: nombreDeFila(i.players),
      eloInicial: i.elo_inicial,
    })),
    rondas: (rondas ?? []).map((r) => {
      const suyos = (pares ?? []).filter((p) => p.round_id === r.id);
      return {
        id: r.id,
        numero: r.numero,
        fechaHora: r.fecha_hora ?? null,
        descansa: r.descansa_id,
        emparejamientos: suyos.map((p) => ({
          blancas: p.blancas_id,
          negras: p.negras_id,
          resultado: p.resultado as "1" | "0.5" | "0" | null,
        })),
        pares: suyos.map((p) => ({ id: p.id, mesa: p.mesa, gameId: p.game_id })),
      };
    }),
  };
}

export type FilaRanking = {
  ficha: string;
  nombre: string;
  elo: number;
  partidas: number;
  eloOficial: number;
};

/**
 * Ranking de ELO interno del club.
 *
 * Se calcula recorriendo TODAS las partidas con resultado de TODOS los torneos
 * internos, en orden de juego, y no se guarda en ninguna tabla. Es la decisión del
 * módulo de ELO: si se acumulara, corregir el resultado de una ronda antigua
 * dejaría el ranking mal para siempre.
 *
 * A escala de club (unos cuantos torneos al año) recorrer todo es instantáneo.
 */
export async function leerRanking(supabase: Cliente): Promise<FilaRanking[]> {
  const [{ data: torneos }, { data: inscritos }] = await Promise.all([
    supabase
      .from("club_tournaments")
      .select("id, created_at")
      .order("created_at"),
    supabase
      .from("club_tournament_players")
      .select("player_id, elo_inicial, tournament_id, players(nombre, apodo, de_prueba)"),
  ]);

  const idsTorneos = (torneos ?? []).map((t) => t.id);
  if (idsTorneos.length === 0) return [];

  const { data: rondas } = await supabase
    .from("club_rounds")
    .select("id, numero, tournament_id")
    .in("tournament_id", idsTorneos)
    .order("numero");

  const idsRondas = (rondas ?? []).map((r) => r.id);
  const { data: pares } =
    idsRondas.length > 0
      ? await supabase
          .from("club_pairings")
          .select("round_id, blancas_id, negras_id, resultado")
          .in("round_id", idsRondas)
          .not("resultado", "is", null)
      : { data: [] };

  // Orden de juego: por torneo (fecha de creación) y dentro de él por ronda.
  const ordenTorneo = new Map(idsTorneos.map((id, i) => [id, i]));
  const rondaPorId = new Map((rondas ?? []).map((r) => [r.id, r]));
  const partidas: PartidaElo[] = (pares ?? [])
    .map((p) => ({ p, r: rondaPorId.get(p.round_id) }))
    .filter((x) => x.r)
    .sort(
      (a, b) =>
        (ordenTorneo.get(a.r!.tournament_id) ?? 0) -
          (ordenTorneo.get(b.r!.tournament_id) ?? 0) ||
        a.r!.numero - b.r!.numero
    )
    .map(({ p }) => ({
      blancas: p.blancas_id,
      negras: p.negras_id,
      resultado: p.resultado as "1" | "0.5" | "0",
    }));

  // ELO de partida de cada uno: el de su primera inscripción, que es de donde
  // arrancó su historia en el club.
  const inicial: Record<string, number> = {};
  const nombres = new Map<string, string>();
  const oficial: Record<string, number> = {};
  // Posición del torneo del que salió el ELO de partida elegido para cada uno,
  // para poder quedarse con el más antiguo. Sin guardarla no hay con qué comparar.
  const desdeTorneo = new Map<string, number>();

  // LA FICHA DE PRUEBAS NO ENTRA EN EL RANKING DEL CLUB (migración 0040), y este es
  // el sitio donde más importa: si el propietario prueba un torneo con resultados, la
  // ficha se ganaría un ELO de club que vería todo el mundo — y ese torneo ya no se
  // puede borrar, porque tener resultados es justo lo que lo impide. Se descarta aquí,
  // en el único sitio que decide quién sale en el ranking, y no en cada pantalla.
  const dePrueba = new Set(
    (inscritos ?? [])
      .filter((i) => (i.players as unknown as { de_prueba?: boolean } | null)?.de_prueba)
      .map((i) => i.player_id as string)
  );

  for (const i of (inscritos ?? []).filter((i) => !dePrueba.has(i.player_id))) {
    nombres.set(
      i.player_id,
      nombreDeFila(i.players)
    );
    const posicion = ordenTorneo.get(i.tournament_id) ?? 0;
    // El ELO oficial de referencia: el de su inscripción más reciente.
    const anteriorOficial = desdeTorneo.get(i.player_id + ":oficial") ?? -1;
    if (posicion >= anteriorOficial) {
      oficial[i.player_id] = i.elo_inicial;
      desdeTorneo.set(i.player_id + ":oficial", posicion);
    }
    // El ELO de partida del ranking: el del torneo MÁS ANTIGUO en el que entró,
    // que es donde arranca su historia en el club.
    const anterior = desdeTorneo.get(i.player_id);
    if (anterior === undefined || posicion < anterior) {
      inicial[i.player_id] = i.elo_inicial;
      desdeTorneo.set(i.player_id, posicion);
    }
  }

  const estado = recalcular(partidas, inicial);

  return Object.entries(estado)
    // `recalcular` recorre las partidas, así que puede devolver a la ficha de pruebas
    // aunque no esté en `inicial`: se vuelve a descartar aquí, que es la salida.
    .filter(([ficha]) => !dePrueba.has(ficha))
    .map(([ficha, e]) => ({
      ficha,
      nombre: nombres.get(ficha) ?? "Socio",
      elo: e.elo,
      partidas: e.partidas,
      eloOficial: oficial[ficha] ?? e.elo,
    }))
    .sort((a, b) => b.elo - a.elo || a.nombre.localeCompare(b.nombre));
}
