import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { calcularMarcador, formatearPunto } from "@/lib/marcador";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

type Estado = "pendiente" | "jugado";
const ESTILO_ESTADO: Record<Estado, string> = {
  pendiente: "bg-tarjeta-suave text-acento-texto ring-1 ring-borde-acento",
  jugado: "bg-tarjeta text-tinta-suave ring-1 ring-borde",
};
const TEXTO_ESTADO: Record<Estado, string> = { pendiente: "Pendiente", jugado: "Jugado" };

function ChipMargen({ margenElo }: { margenElo: number | null }) {
  const texto = margenElo ? `≥${margenElo} ELO` : "Orden estricto";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
      {texto}
    </span>
  );
}

function ChipEstado({ estado }: { estado: Estado }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILO_ESTADO[estado]}`}>
      {TEXTO_ESTADO[estado]}
    </span>
  );
}

function formatearFechaCorta(fechaHoraISO: string | null): string {
  if (!fechaHoraISO || Number.isNaN(new Date(fechaHoraISO).getTime())) return "Sin fecha";
  return formatearFechaMadrid(fechaHoraISO, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default async function EquipoDetallePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: equipo } = await supabase
    .from("teams")
    .select("id, nombre, categoria, margen_elo, team_captains(player_id, players(nombre))")
    .eq("id", id)
    .maybeSingle();
  if (!equipo) redirect("/equipos");

  const [{ data: esCapitan }, admin, { data: jornadas }, { data: standings }] = await Promise.all([
    supabase.rpc("es_capitan_de", { equipo: id }),
    esAdmin(),
    supabase
      .from("matches")
      .select("id, ronda, fecha_hora, rival, es_local, sede, estado, marcador_propio, marcador_rival")
      .eq("team_id", id)
      .order("ronda"),
    supabase
      .from("standings")
      .select("posicion, club, puntos, es_nuestro")
      .eq("team_id", id)
      .order("posicion"),
  ]);
  const puedeGestionar = Boolean(esCapitan) || admin;

  // Chip "Conv." (Task 6): un extra query barata para saber qué jornadas ya
  // tienen convocatoria publicada (la RLS de `lineups` ya permite leer las
  // publicadas a cualquier usuario autenticado). Se aprovecha la misma query
  // para traer los tableros de esas convocatorias: algunas jornadas (p. ej.
  // resultados anotados por el capitán tablero a tablero, Task 7) NO tienen
  // `marcador_propio`/`marcador_rival` en `matches` — esas columnas solo las
  // rellena la sync FACV (Task 8) — así que sin esto la fila se quedaría sin
  // marcador aunque la jornada esté jugada y completa (ver detalle en
  // `/jornadas/[matchId]`, que ya hace este mismo cálculo).
  const idsJornadas = (jornadas ?? []).map((j) => j.id);
  const { data: lineupsPublicadas } = idsJornadas.length > 0
    ? await supabase
        .from("lineups")
        .select("match_id, lineup_boards(id)")
        .eq("estado", "publicada")
        .in("match_id", idsJornadas)
    : { data: [] };
  const conConvocatoria = new Set((lineupsPublicadas ?? []).map((l) => l.match_id));

  type LineupBoardFila = { id: string };
  const idsTableroPorMatch = new Map<string, string[]>(
    (lineupsPublicadas ?? []).map((l) => [
      l.match_id as string,
      ((l.lineup_boards ?? []) as unknown as LineupBoardFila[]).map((b) => b.id),
    ])
  );
  const todosLosTableros = [...idsTableroPorMatch.values()].flat();
  const { data: resultadosTablero } = todosLosTableros.length > 0
    ? await supabase.from("board_results").select("lineup_board_id, resultado").in("lineup_board_id", todosLosTableros)
    : { data: [] };
  const resultadoPorTablero = new Map(
    (resultadosTablero ?? []).map((r) => [r.lineup_board_id as string, r.resultado as number])
  );
  const marcadorPorTablerosDeMatch = new Map<string, string>();
  for (const [matchId, idsTablero] of idsTableroPorMatch) {
    if (idsTablero.length === 0) continue;
    const resultados = idsTablero
      .map((id) => resultadoPorTablero.get(id))
      .filter((r): r is number => r !== undefined);
    if (resultados.length !== idsTablero.length) continue; // aún incompleto
    marcadorPorTablerosDeMatch.set(matchId, calcularMarcador(resultados, idsTablero.length).texto);
  }

  const capitanes = (equipo.team_captains ?? []) as unknown as {
    player_id: string;
    players: { nombre: string } | null;
  }[];

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo={equipo.nombre} subtitulo={equipo.categoria} volverA="/equipos" />
      <div className="mx-auto max-w-md space-y-4 p-4">
        <Tarjeta className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <ChipMargen margenElo={equipo.margen_elo} />
            {puedeGestionar && (
              <Boton variante="secundario" href={`/equipos/${id}/plantilla`} className="text-sm">
                Plantilla y disponibilidad
              </Boton>
            )}
          </div>
          <p className="text-sm text-tinta-suave">
            {capitanes.length === 0
              ? "Sin capitán asignado"
              : `Capitán: ${capitanes.map((c) => c.players?.nombre ?? "—").join(", ")}`}
          </p>
        </Tarjeta>

        {(jornadas ?? []).length === 0 ? (
          <EstadoVacio
            icono="📅"
            titulo="Sin calendario todavía"
            detalle="Cuando se publique el calendario de la FACV aparecerá aquí"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
            <ul className="divide-y divide-borde">
              {(jornadas ?? []).map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/jornadas/${j.id}`}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-tarjeta-suave"
                  >
                    <span className="shrink-0 rounded-full bg-tarjeta-suave px-2 py-0.5 text-xs font-semibold text-acento-texto ring-1 ring-borde-acento">
                      R{j.ronda}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                      {j.es_local ? "vs" : "@"} {j.rival}
                    </span>
                    {j.marcador_propio !== null && j.marcador_rival !== null ? (
                      <span className="shrink-0 text-sm font-semibold text-tinta">
                        {formatearPunto(j.marcador_propio)}–{formatearPunto(j.marcador_rival)}
                      </span>
                    ) : (
                      marcadorPorTablerosDeMatch.has(j.id) && (
                        <span className="shrink-0 text-sm font-semibold text-tinta">
                          {marcadorPorTablerosDeMatch.get(j.id)}
                        </span>
                      )
                    )}
                    <span className="shrink-0 text-right text-xs text-tinta-suave">
                      {formatearFechaCorta(j.fecha_hora)}
                    </span>
                    {conConvocatoria.has(j.id) && (
                      <span className="shrink-0 rounded-full bg-acento-fuerte px-2 py-0.5 text-xs font-semibold text-sobre-acento">
                        Conv.
                      </span>
                    )}
                    <ChipEstado estado={j.estado as Estado} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(standings ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold text-tinta">Clasificación</h2>
            <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-xs text-tinta-suave">
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Club</th>
                    <th className="px-3 py-2 text-right font-medium">Ptos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {(standings ?? []).map((s) => (
                    <tr
                      key={s.posicion}
                      className={s.es_nuestro ? "bg-tarjeta-suave font-semibold text-acento-texto" : "text-tinta"}
                    >
                      <td className="px-3 py-1.5">{s.posicion}</td>
                      <td className="px-3 py-1.5 truncate">{s.club}</td>
                      <td className="px-3 py-1.5 text-right">{formatearPunto(s.puntos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
