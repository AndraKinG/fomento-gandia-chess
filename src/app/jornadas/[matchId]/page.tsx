import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { esCapitanDeMatch } from "@/lib/auth/es-capitan";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { colorDeTablero } from "@/lib/validador/colores";
import { calcularMarcador, formatearPunto } from "@/lib/marcador";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { ChipTablero } from "@/components/ui/ChipTablero";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { ResultadosEditor, type BoardParaEditar } from "./ResultadosEditor";

type BoardFila = {
  id: string;
  tablero: number;
  player_id: string;
  players: { nombre: string } | null;
};

/**
 * Detalle público de una jornada (Task 7, Fase 1C): cualquier usuario
 * autenticado puede verla (no hace falta ser del equipo). Solo muestra la
 * convocatoria PUBLICADA — un borrador no es RLS-invisible aquí a propósito
 * (se filtra explícitamente por `estado = 'publicada'`) incluso para el
 * propio capitán: esta pantalla es la vista pública de la jornada, no el
 * editor (`/equipos/[id]/convocatoria/[matchId]`), así que un borrador a
 * medio montar se trata igual que si no existiera convocatoria.
 */
export default async function JornadaPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabase = await createServerSupabase();

  const { data: match } = await supabase
    .from("matches")
    .select("id, team_id, ronda, fecha_hora, rival, es_local, sede, estado, teams(nombre)")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) redirect("/");

  const equipoNombre = (match.teams as unknown as { nombre: string } | null)?.nombre ?? "Equipo";

  const [{ data: lineup }, tieneCapitania, admin] = await Promise.all([
    supabase
      .from("lineups")
      .select("id, lineup_boards(id, tablero, player_id, players(nombre))")
      .eq("match_id", matchId)
      .eq("estado", "publicada")
      .maybeSingle(),
    esCapitanDeMatch(matchId),
    esAdmin(),
  ]);
  const puedeGestionar = tieneCapitania || admin;

  const boards = ((lineup?.lineup_boards ?? []) as unknown as BoardFila[])
    .slice()
    .sort((a, b) => a.tablero - b.tablero);

  const resultadosPorBoard = new Map<string, number>();
  if (boards.length > 0) {
    const { data: resultados } = await supabase
      .from("board_results")
      .select("lineup_board_id, resultado")
      .in(
        "lineup_board_id",
        boards.map((b) => b.id)
      );
    for (const r of resultados ?? []) {
      resultadosPorBoard.set(r.lineup_board_id as string, r.resultado as number);
    }
  }

  const marcador = calcularMarcador(
    boards
      .map((b) => resultadosPorBoard.get(b.id))
      .filter((r): r is number => r !== undefined),
    boards.length
  );

  const fecha = formatearFechaMadrid(match.fecha_hora, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const boardsParaEditor: BoardParaEditar[] = boards.map((b) => ({
    lineupBoardId: b.id,
    tablero: b.tablero,
    color: colorDeTablero(b.tablero, match.es_local),
    nombre: b.players?.nombre ?? "—",
    resultadoInicial: (resultadosPorBoard.get(b.id) as 1 | 0.5 | 0 | undefined) ?? null,
  }));

  return (
    <main className="min-h-dvh bg-fondo pb-24">
      <Cabecera
        titulo={`R${match.ronda} · ${match.es_local ? "vs" : "@"} ${match.rival}`}
        subtitulo={`${equipoNombre} · ${fecha}`}
        volverA={`/equipos/${match.team_id}`}
      />
      <div className="mx-auto max-w-md space-y-4 p-4">
        <Tarjeta className="flex flex-col gap-1">
          <p className="text-sm text-tinta-suave">
            {match.es_local ? "En casa" : "Fuera"}
            {match.sede ? ` · ${match.sede}` : ""}
          </p>
          {marcador.completos > 0 && (
            <p className="text-2xl font-bold text-tinta">
              {marcador.texto}{" "}
              {marcador.completos < marcador.total && (
                <span className="text-sm font-normal text-tinta-suave">
                  ({marcador.completos}/{marcador.total})
                </span>
              )}
            </p>
          )}
        </Tarjeta>

        {match.estado === "jugado" && <Banner tipo="ok">Jornada jugada.</Banner>}

        {boards.length === 0 ? (
          <EstadoVacio
            icono="📋"
            titulo="Convocatoria pendiente de publicar"
            detalle="Cuando el capitán publique la convocatoria verás aquí los tableros"
          />
        ) : (
          <section className="space-y-2">
            <h2 className="font-semibold text-tinta">Tableros</h2>
            {boards.map((b) => {
              const color = colorDeTablero(b.tablero, match.es_local);
              const resultado = resultadosPorBoard.get(b.id);
              return (
                <Tarjeta key={b.id} compacta className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChipTablero tablero={b.tablero} color={color} />
                    <span className="min-w-0 truncate text-sm font-medium text-tinta">
                      {b.players?.nombre ?? "—"}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-tinta">
                    {resultado === undefined ? "—" : formatearPunto(resultado)}
                  </span>
                </Tarjeta>
              );
            })}
          </section>
        )}

        {boards.length > 0 && puedeGestionar && (
          <ResultadosEditor matchId={matchId} boards={boardsParaEditor} totalTableros={boards.length} />
        )}
      </div>
    </main>
  );
}
