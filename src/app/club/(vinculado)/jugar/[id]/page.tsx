import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Contenedor } from "@/components/ui/Contenedor";
import { Mesa, type Mensaje, type Partida } from "./Mesa";
import { nombreVisible } from "@/lib/club/nombre-socio";

/**
 * Una partida en vivo.
 *
 * SE PUEDE MIRAR SIN JUGARLA: en un club se sigue lo que juegan los demás, y las de
 * los torneos internos tienen que poder verse. Quien no juega no ve ni los botones
 * ni la caja del chat; eso lo decide `Mesa` con la ficha que se le pasa.
 */
export default async function PartidaEnVivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await sesionActual();
  const supabase = await createServerSupabase();

  const { data: fila } = await supabase
    .from("live_games")
    .select(
      "id, blancas_id, negras_id, jugadas, turno, blancas_ms, negras_ms, base_ms, incremento_ms, ultima_jugada_en, resultado, motivo, tablas_ofrecidas_por, vuelta_pedida_por, origen"
    )
    .eq("id", id)
    .maybeSingle();
  if (!fila) redirect("/club/jugar");

  const [{ data: jugadores }, { data: chat }, { data: elos }] = await Promise.all([
    supabase.from("players").select("id, nombre, apodo").in("id", [fila.blancas_id, fila.negras_id]),
    supabase
      .from("live_chat")
      .select("id, player_id, texto, evento, creado_en")
      .eq("live_game_id", id)
      .order("creado_en"),
    // El ELO oficial, para el resumen del final. De la temporada activa, que es la
    // que la gente entiende por "su ELO".
    supabase
      .from("force_order")
      .select("player_id, elo_oficial, seasons!inner(activa)")
      .in("player_id", [fila.blancas_id, fila.negras_id])
      .eq("seasons.activa", true),
  ]);

  const nombre = new Map((jugadores ?? []).map((j) => [j.id, nombreVisible(j)]));
  const elo = new Map(
    (elos ?? []).map((f) => [f.player_id as string, (f.elo_oficial as number | null) ?? null])
  );

  const partida: Partida = {
    id: fila.id,
    blancasId: fila.blancas_id,
    negrasId: fila.negras_id,
    blancasNombre: nombre.get(fila.blancas_id) ?? "Socio",
    negrasNombre: nombre.get(fila.negras_id) ?? "Socio",
    blancasElo: elo.get(fila.blancas_id) ?? null,
    negrasElo: elo.get(fila.negras_id) ?? null,
    jugadas: fila.jugadas ?? [],
    turno: fila.turno,
    blancasMs: fila.blancas_ms,
    negrasMs: fila.negras_ms,
    baseMs: fila.base_ms,
    incrementoMs: fila.incremento_ms,
    ultimaJugadaEn: fila.ultima_jugada_en,
    resultado: fila.resultado,
    motivo: fila.motivo,
    tablasOfrecidasPor: fila.tablas_ofrecidas_por,
    vueltaPedidaPor: fila.vuelta_pedida_por,
  };

  const mensajes: Mensaje[] = (chat ?? []).map((m) => ({
    id: m.id,
    playerId: m.player_id,
    texto: m.texto,
    evento: m.evento,
    creadoEn: m.creado_en,
  }));

  const minutos = Math.round(fila.base_ms / 60_000);
  const incremento = Math.round(fila.incremento_ms / 1000);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={`${partida.blancasNombre} — ${partida.negrasNombre}`}
        subtitulo={`${minutos}+${incremento}${fila.origen === "torneo" ? " · torneo del club" : ""}`}
        volverA="/club/jugar"
        medida="panel"
      />
      <Contenedor medida="panel">
        <Mesa inicial={partida} mensajesIniciales={mensajes} yo={sesion?.playerId ?? null} />
      </Contenedor>
    </main>
  );
}
