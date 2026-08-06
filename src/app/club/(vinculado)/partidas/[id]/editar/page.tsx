import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { FormularioPartida } from "../../FormularioPartida";
import { cargarOpciones } from "../../opciones";
import { Contenedor } from "@/components/ui/Contenedor";

export default async function EditarPartidaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await sesionActual();
  if (!sesion?.playerId) redirect("/club/vincular");

  const supabase = await createServerSupabase();
  const { data: p } = await supabase
    .from("games")
    .select(
      "id, player_id, fecha, ronda, rival_nombre, rival_id, rival_elo, mi_elo, color, resultado, apertura, notas, pgn, torneo_texto, tournament_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) redirect("/club/partidas");
  // Solo el dueño edita. La RLS ya lo impide al escribir; esto evita enseñar un
  // formulario que al guardar no iba a funcionar.
  if (p.player_id !== sesion.playerId) redirect(`/club/partidas/${id}`);

  const { torneos, socios } = await cargarOpciones(supabase, sesion.playerId);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Editar partida"
        subtitulo={p.rival_nombre}
        volverA={`/club/partidas/${id}`} medida="formulario"
      />
      <Contenedor medida="formulario">
        <FormularioPartida
          torneos={torneos}
          socios={socios}
          inicial={{
            id: p.id,
            fecha: p.fecha,
            ronda: p.ronda ? String(p.ronda) : "",
            rivalNombre: p.rival_nombre,
            rivalId: p.rival_id ?? "",
            rivalElo: p.rival_elo ? String(p.rival_elo) : "",
            miElo: p.mi_elo ? String(p.mi_elo) : "",
            color: p.color,
            resultado: p.resultado,
            tournamentId: p.tournament_id ?? "",
            torneoTexto: p.torneo_texto ?? "",
            apertura: p.apertura ?? "",
            notas: p.notas ?? "",
            pgn: p.pgn ?? "",
          }}
        />
      </Contenedor>
    </main>
  );
}
