import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { sesionActual } from "@/lib/auth/sesion";
import { esCapitanDeMatch } from "@/lib/auth/es-capitan";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { colorDeTablero } from "@/lib/validador/colores";
import { calcularMarcador, formatearPunto, marcadorPreferido } from "@/lib/marcador";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { ChipTablero } from "@/components/ui/ChipTablero";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { ResultadosEditor, type BoardParaEditar } from "./ResultadosEditor";
import { Contenedor } from "@/components/ui/Contenedor";

type BoardFila = {
  id: string;
  tablero: number;
  player_id: string;
  players: { nombre: string } | null;
};

/** Fila del acta oficial, ya desde nuestro punto de vista (ver migración 0018). */
type ActaFila = {
  tablero: number;
  nuestro_nombre: string;
  nuestro_elo: number | null;
  nuestro_player_id: string | null;
  nuestras_blancas: boolean;
  rival_nombre: string;
  rival_elo: number | null;
  resultado: "1" | "0.5" | "0" | null;
  incomparecencia: boolean;
};

const TEXTO_RESULTADO: Record<"1" | "0.5" | "0", string> = {
  "1": "1",
  "0.5": "½",
  "0": "0",
};

/** Color del punto en la tabla del acta: ganada, perdida o tablas. */
const TONO_RESULTADO: Record<"1" | "0.5" | "0", string> = {
  "1": "text-green-700 dark:text-green-400",
  "0.5": "text-tinta-suave",
  "0": "text-red-700 dark:text-red-400",
};

/**
 * Acta oficial tablero a tablero.
 *
 * ES LO QUE FALTABA EN ESTA PANTALLA. Una jornada jugada solo podía enseñar el
 * marcador global y un "Jornada jugada", porque el detalle no estaba en la base: el
 * calendario de la FACV solo publica el marcador. Ahora se importa de chess-results
 * (`chessresults-apply.ts`) y se guarda en `match_boards`.
 *
 * Tabla y no una tarjeta por tablero: son ocho filas con seis datos cada una —
 * tablero, color, nuestro jugador, su ELO, el rival, su ELO y el punto— y en tarjetas
 * no hay forma de alinear las columnas para poder compararlas de un vistazo. Las de
 * ELO se esconden en móvil, que es donde no caben.
 */
function Acta({ filas, miFicha }: { filas: ActaFila[]; miFicha: string | null }) {
  return (
    <Tarjeta compacta>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-tinta-suave">
              <th scope="col" className="pb-1 pr-2 font-medium">
                Tab.
              </th>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Nuestro
              </th>
              <th scope="col" className="hidden pb-1 pr-2 text-right font-medium sm:table-cell">
                ELO
              </th>
              <th scope="col" className="pb-1 pr-2 text-center font-medium">
                Res.
              </th>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Rival
              </th>
              <th scope="col" className="hidden pb-1 text-right font-medium sm:table-cell">
                ELO
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const soyYo = f.nuestro_player_id !== null && f.nuestro_player_id === miFicha;
              return (
                <tr
                  key={f.tablero}
                  className={`border-t border-borde ${soyYo ? "bg-tarjeta-suave" : ""}`}
                >
                  <td className="py-1.5 pr-2">
                    <ChipTablero
                      tablero={f.tablero}
                      color={f.nuestras_blancas ? "blancas" : "negras"}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-tinta">
                    <span className={soyYo ? "font-semibold" : ""}>{f.nuestro_nombre}</span>
                  </td>
                  <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                    {f.nuestro_elo ?? "—"}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-center font-semibold tabular-nums ${
                      f.resultado ? TONO_RESULTADO[f.resultado] : "text-tinta-suave"
                    }`}
                  >
                    {f.resultado ? TEXTO_RESULTADO[f.resultado] : "—"}
                    {f.incomparecencia && (
                      <span
                        className="ml-1 text-xs font-normal text-tinta-suave"
                        title="Punto por incomparecencia: no se jugó la partida"
                      >
                        (inc.)
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-tinta-suave">{f.rival_nombre}</td>
                  <td className="hidden py-1.5 text-right tabular-nums text-tinta-suave sm:table-cell">
                    {f.rival_elo ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/**
 * Detalle público de una jornada (Task 7, Fase 1C): cualquier usuario
 * autenticado puede verla (no hace falta ser del equipo). Solo muestra la
 * convocatoria PUBLICADA — un borrador no es RLS-invisible aquí a propósito
 * (se filtra explícitamente por `estado = 'publicada'`) incluso para el
 * propio capitán: esta pantalla es la vista pública de la jornada, no el
 * editor (`/club/equipos/[id]/convocatoria/[matchId]`), así que un borrador a
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
    .select(
      "id, team_id, ronda, fecha_hora, rival, es_local, sede, estado, marcador_propio, marcador_rival, teams(nombre)"
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!match) redirect("/club");

  const equipoNombre = (match.teams as unknown as { nombre: string } | null)?.nombre ?? "Equipo";

  const [{ data: lineup }, { data: acta }, tieneCapitania, admin, sesion] =
    await Promise.all([
      supabase
        .from("lineups")
        .select("id, lineup_boards(id, tablero, player_id, players(nombre))")
        .eq("match_id", matchId)
        .eq("estado", "publicada")
        .maybeSingle(),
      supabase
        .from("match_boards")
        .select(
          "tablero, nuestro_nombre, nuestro_elo, nuestro_player_id, nuestras_blancas, rival_nombre, rival_elo, resultado, incomparecencia"
        )
        .eq("match_id", matchId)
        .order("tablero"),
      esCapitanDeMatch(matchId),
      esAdmin(),
      sesionActual(),
    ]);
  const puedeGestionar = tieneCapitania || admin;
  const filasActa = (acta ?? []) as unknown as ActaFila[];

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

  // Revisión final 1C, item 3: precedencia compartida con `/club/equipos/[id]`
  // (marcadorPreferido, src/lib/marcador.ts) — boards del capitán primero,
  // marcador global de la sync FACV solo como fallback sin ningún resultado
  // por tablero.
  const boardsMarcador = calcularMarcador(
    boards
      .map((b) => resultadosPorBoard.get(b.id))
      .filter((r): r is number => r !== undefined),
    boards.length
  );
  const marcador = marcadorPreferido({
    boardsMarcador,
    marcadorPropio: match.marcador_propio,
    marcadorRival: match.marcador_rival,
  });

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
        volverA={`/club/equipos/${match.team_id}`} medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {/* Marcador con los dos nombres, no solo las cifras. Antes ponía "Fuera" y
            "3½ – 4½" sin decir de quién era cada número, y en un encuentro fuera de
            casa el orden no es evidente. */}
        <Tarjeta destacada={marcador !== null}>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
            <p className="min-w-0 flex-1 text-right font-semibold text-tinta">
              {equipoNombre}
            </p>
            <p className="shrink-0 text-3xl font-bold tabular-nums text-tinta">
              {marcador ? marcador.texto : "– : –"}
            </p>
            <p className="min-w-0 flex-1 text-left font-semibold text-tinta">
              {match.rival}
            </p>
          </div>
          <p className="mt-2 text-center text-sm text-tinta-suave">
            {match.es_local ? "En casa" : "Fuera"}
            {match.sede ? ` · ${match.sede}` : ""}
            {marcador?.parcial
              ? ` · Parcial, ${boardsMarcador.completos} de ${boardsMarcador.total} tableros`
              : ""}
          </p>
        </Tarjeta>

        {match.estado === "jugado" && !marcador && (
          <Banner tipo="ok">Jornada jugada.</Banner>
        )}

        {filasActa.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold text-tinta">Acta oficial</h2>
            <Acta filas={filasActa} miFicha={sesion?.playerId ?? null} />
            <p className="px-1 text-xs text-tinta-suave">
              Tal y como la publica la FACV en chess-results. Se sincroniza sola con
              los resultados; el color es el de nuestro jugador en ese tablero.
            </p>
          </section>
        )}

        {boards.length === 0 && filasActa.length === 0 ? (
          <EstadoVacio
            icono="📋"
            titulo={
              match.estado === "jugado"
                ? "Acta pendiente de sincronizar"
                : "Convocatoria pendiente de publicar"
            }
            detalle={
              match.estado === "jugado"
                ? "La FACV publica el acta por tableros unos días después de la jornada. En cuanto esté, aparece aquí."
                : "Cuando el capitán publique la convocatoria verás aquí los tableros"
            }
          />
        ) : boards.length === 0 ? null : (
          <section className="space-y-2">
            {/* "Convocatoria" y no "Tableros": cuando también está el acta oficial,
                hay dos listas de tableros en la pantalla y hay que poder distinguir
                la del capitán de la oficial. */}
            <h2 className="font-semibold text-tinta">Convocatoria del capitán</h2>
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
      </Contenedor>
    </main>
  );
}
