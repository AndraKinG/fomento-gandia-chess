import type { SupabaseClient } from "@supabase/supabase-js";
import { MINUTOS_DE_AVISO, MINUTOS_DE_GRACIA } from "./hora-de-ronda";
import { nombreDeFila } from "@/lib/club/nombre-socio";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cliente = SupabaseClient<any, "public", any>;

/** Lo que necesita la tarjeta de "tu ronda empieza" para pintarse sola. */
export type ProximaRondaVista = {
  torneoId: string;
  torneoNombre: string;
  numero: number;
  /** Instante de comienzo, en ISO. La cuenta atrás la hace el navegador con esto. */
  fechaHora: string;
  mesa: number;
  rival: string;
  /** El cruce, para poder abrir la mesa directamente. */
  pairingId: string;
};

/**
 * La ronda del socio que está a punto de empezar, si la hay.
 *
 * LA HORA LA CALCULA EL NAVEGADOR, NO ESTA FUNCIÓN, y por eso devuelve la ronda
 * desde bastante antes de que toque enseñar nada: el servidor solo dice "tienes esto
 * a esta hora" y la tarjeta decide cuándo aparece (ver `tocaLaTarjeta`). Si el
 * servidor decidiera, quien deja la app abierta media hora se quedaría sin tarjeta —
 * su página se pintó cuando todavía faltaba mucho.
 *
 * Se llama desde el layout de socios, así que se ejecuta en CADA pantalla: es una
 * consulta por índice que lo normal es que devuelva cero filas, y la segunda solo
 * se hace si la primera trajo algo.
 */
export async function leerProximaRonda(
  supabase: Cliente,
  playerId: string | null
): Promise<ProximaRondaVista | null> {
  if (!playerId) return null;

  const ahora = Date.now();
  const desde = new Date(ahora - MINUTOS_DE_GRACIA * 60_000).toISOString();
  const hasta = new Date(ahora + MINUTOS_DE_AVISO * 60_000).toISOString();

  const { data: rondas } = await supabase
    .from("club_rounds")
    .select("id, numero, fecha_hora, tournament_id, club_tournaments(nombre, estado)")
    .gte("fecha_hora", desde)
    .lte("fecha_hora", hasta);

  const enJuego = ((rondas ?? []) as unknown as FilaRonda[]).filter(
    (r) => r.fecha_hora && r.club_tournaments?.estado !== "terminado"
  );
  if (enJuego.length === 0) return null;

  const { data: cruces } = await supabase
    .from("club_pairings")
    .select("id, mesa, round_id, blancas_id, negras_id, blancas:blancas_id(nombre, apodo), negras:negras_id(nombre, apodo)")
    .in(
      "round_id",
      enJuego.map((r) => r.id)
    )
    .or(`blancas_id.eq.${playerId},negras_id.eq.${playerId}`)
    // Una partida ya jugada (se adelantó) no necesita recordatorio.
    .is("resultado", null);

  const mios = (cruces ?? []) as unknown as FilaCruce[];
  if (mios.length === 0) return null;

  const rondaPorId = new Map(enJuego.map((r) => [r.id, r]));
  // La más cercana primero: si coinciden dos torneos, manda la que empieza antes.
  const elegido = mios
    .map((c) => ({ c, r: rondaPorId.get(c.round_id) }))
    .filter((x): x is { c: FilaCruce; r: FilaRonda } => Boolean(x.r))
    .sort((a, b) => (a.r.fecha_hora ?? "").localeCompare(b.r.fecha_hora ?? ""))[0];
  if (!elegido) return null;

  const soyBlancas = elegido.c.blancas_id === playerId;
  return {
    torneoId: elegido.r.tournament_id,
    torneoNombre: elegido.r.club_tournaments?.nombre ?? "Torneo del club",
    numero: elegido.r.numero,
    fechaHora: elegido.r.fecha_hora!,
    mesa: elegido.c.mesa,
    rival: nombreDeFila(soyBlancas ? elegido.c.negras : elegido.c.blancas),
    pairingId: elegido.c.id,
  };
}

type FilaRonda = {
  id: string;
  numero: number;
  fecha_hora: string | null;
  tournament_id: string;
  club_tournaments: { nombre: string; estado: string } | null;
};

type FilaCruce = {
  id: string;
  mesa: number;
  round_id: string;
  blancas_id: string;
  negras_id: string;
  blancas: { nombre: string } | null;
  negras: { nombre: string } | null;
};
