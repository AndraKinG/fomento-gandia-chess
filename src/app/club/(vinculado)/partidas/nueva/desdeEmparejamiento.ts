import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartidaInicial } from "../FormularioPartida";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cliente = SupabaseClient<any, "public", any>;

/**
 * Rellena el formulario de partida a partir de un emparejamiento de un torneo
 * interno.
 *
 * Sirve para que un socio suba las jugadas de su partida del torneo sin volver a
 * teclear lo que la app ya sabe: rival, color, resultado, torneo y ronda. Lo único
 * que le queda por poner son las jugadas y sus comentarios.
 *
 * Devuelve null si el emparejamiento no existe o si el socio no jugó esa partida:
 * las jugadas de una partida las sube quien la jugó.
 */
export async function inicialDesdeEmparejamiento(
  supabase: Cliente,
  pairingId: string,
  miFicha: string
): Promise<{ inicial: PartidaInicial; nombreTorneo: string } | null> {
  const { data: par } = await supabase
    .from("club_pairings")
    .select(
      "id, blancas_id, negras_id, resultado, club_rounds(numero, club_tournaments(nombre, fecha_inicio))"
    )
    .eq("id", pairingId)
    .maybeSingle();
  if (!par) return null;

  const soyBlancas = par.blancas_id === miFicha;
  const soyNegras = par.negras_id === miFicha;
  if (!soyBlancas && !soyNegras) return null;

  const ronda = par.club_rounds as unknown as {
    numero: number;
    club_tournaments: { nombre: string; fecha_inicio: string | null } | null;
  } | null;
  const torneo = ronda?.club_tournaments ?? null;

  const rivalId = soyBlancas ? par.negras_id : par.blancas_id;
  const { data: rival } = await supabase
    .from("players")
    .select("nombre")
    .eq("id", rivalId)
    .single();

  // El resultado guardado es desde el punto de vista de las BLANCAS, así que hay
  // que darle la vuelta si el socio jugó con negras.
  const bruto = par.resultado as "1" | "0.5" | "0" | null;
  const mio =
    bruto === null
      ? "1"
      : soyBlancas
        ? bruto
        : bruto === "1"
          ? "0"
          : bruto === "0"
            ? "1"
            : "0.5";

  return {
    nombreTorneo: torneo?.nombre ?? "el torneo",
    inicial: {
      id: "",
      // La fecha del torneo si la hay; el socio puede corregirla.
      fecha: torneo?.fecha_inicio ?? "",
      ronda: ronda?.numero ? String(ronda.numero) : "",
      rivalNombre: rival?.nombre ?? "",
      rivalId,
      rivalElo: "",
      miElo: "",
      color: soyBlancas ? "blancas" : "negras",
      resultado: mio,
      // Los torneos internos no están en la tabla `tournaments` (esa es la del
      // calendario FACV), así que el nombre va como texto libre.
      tournamentId: "",
      torneoTexto: torneo?.nombre ?? "",
      apertura: "",
      notas: "",
      pgn: "",
      // Una partida de un torneo del club es del club: nace compartida.
      privada: false,
    },
  };
}
