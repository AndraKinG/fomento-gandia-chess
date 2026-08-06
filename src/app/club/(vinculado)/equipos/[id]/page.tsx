import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { calcularMarcador, formatearPunto, marcadorPreferido } from "@/lib/marcador";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor } from "@/components/ui/Contenedor";

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
  if (!equipo) redirect("/club/equipos");

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
  // `/club/jornadas/[matchId]`, que ya hace este mismo cálculo).
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
  // Revisión final 1C, item 3: se guarda el Marcador COMPLETO (no solo el
  // texto de cuando estaba completo) para poder aplicar la precedencia
  // compartida `marcadorPreferido` — antes esta lista solo guardaba el
  // marcador de tableros si ya estaba completo, y la precedencia de la fila
  // (ver JSX más abajo) estaba INVERTIDA: prefería el marcador global de la
  // sync FACV incluso habiendo resultados por tablero más fiables.
  // Acta oficial de cada jornada, para que ninguna jugada se quede sin marcador: la
  // sync de la FACV no escribe `marcador_propio` si el capitán anotó por tablero, así
  // que sin el acta una jornada podía no tener ninguna de las dos fuentes.
  const { data: filasActa } = idsJornadas.length > 0
    ? await supabase.from("match_boards").select("match_id, resultado").in("match_id", idsJornadas)
    : { data: [] };
  const actaPorMatch = new Map<string, { resultados: number[]; total: number }>();
  for (const f of filasActa ?? []) {
    const clave = f.match_id as string;
    const acumulado = actaPorMatch.get(clave) ?? { resultados: [], total: 0 };
    acumulado.total++;
    if (f.resultado !== null) acumulado.resultados.push(Number(f.resultado));
    actaPorMatch.set(clave, acumulado);
  }
  const marcadorPorActaDeMatch = new Map<string, ReturnType<typeof calcularMarcador>>();
  for (const [matchId, { resultados, total }] of actaPorMatch) {
    marcadorPorActaDeMatch.set(matchId, calcularMarcador(resultados, total));
  }

  const marcadorPorTablerosDeMatch = new Map<string, ReturnType<typeof calcularMarcador>>();
  for (const [matchId, idsTablero] of idsTableroPorMatch) {
    if (idsTablero.length === 0) continue;
    const resultados = idsTablero
      .map((id) => resultadoPorTablero.get(id))
      .filter((r): r is number => r !== undefined);
    marcadorPorTablerosDeMatch.set(matchId, calcularMarcador(resultados, idsTablero.length));
  }

  const capitanes = (equipo.team_captains ?? []) as unknown as {
    player_id: string;
    players: { nombre: string } | null;
  }[];

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo={equipo.nombre} subtitulo={equipo.categoria} volverA="/club/equipos" medida="panel" />
      <Contenedor medida="panel" className="space-y-4">
        {/* Los datos del equipo a la izquierda y la acción a la derecha, no el chip
            pegado al botón: antes el chip del margen y el botón de plantilla compartían
            fila y parecían la misma cosa, con "Sin capitán asignado" suelto debajo. */}
        <Tarjeta className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-tinta">
              {capitanes.length === 0 ? (
                <span className="text-tinta-suave">Sin capitán asignado</span>
              ) : (
                <>
                  <span className="text-tinta-suave">
                    {capitanes.length === 1 ? "Capitán: " : "Capitanes: "}
                  </span>
                  <span className="font-medium">
                    {capitanes.map((c) => c.players?.nombre ?? "—").join(", ")}
                  </span>
                </>
              )}
            </p>
            <ChipMargen margenElo={equipo.margen_elo} />
          </div>
          {puedeGestionar && (
            <Boton
              variante="secundario"
              href={`/club/equipos/${id}/plantilla`}
              className="shrink-0 text-sm"
            >
              Plantilla y disponibilidad
            </Boton>
          )}
        </Tarjeta>

        {/* Calendario y clasificación en paralelo desde `lg`: la clasificación es una
            tabla estrecha de tres columnas y apilada dejaba media pantalla vacía a su
            derecha. El calendario se lleva dos tercios porque sus filas son las que
            necesitan ancho. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
          Calendario
        </h2>
        {(jornadas ?? []).length === 0 ? (
          <EstadoVacio
            icono="📅"
            titulo="Sin calendario todavía"
            detalle="Cuando se publique el calendario de la FACV aparecerá aquí"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
            <ul className="divide-y divide-borde">
              {(jornadas ?? []).map((j) => {
                const marcador = marcadorPreferido({
                  boardsMarcador: marcadorPorTablerosDeMatch.get(j.id),
                  actaMarcador: marcadorPorActaDeMatch.get(j.id),
                  marcadorPropio: j.marcador_propio,
                  marcadorRival: j.marcador_rival,
                });
                return (
                  <li key={j.id}>
                    {/* DOS FILAS EN MÓVIL Y UNA EN ESCRITORIO. Antes eran seis cosas
                        seguidas en una sola fila —ronda, rival, marcador, fecha, chip de
                        convocatoria y chip de estado— y en un teléfono el nombre del
                        rival se quedaba en tres letras para hacerles sitio. Ahora la
                        segunda línea baja en móvil y sube a la derecha desde `sm`. */}
                    <Link
                      href={`/club/jornadas/${j.id}`}
                      className="flex flex-col gap-1 px-3 py-2.5 transition hover:bg-tarjeta-suave sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="shrink-0 rounded-full bg-tarjeta-suave px-2 py-0.5 text-xs font-semibold text-acento-texto ring-1 ring-borde-acento">
                          R{j.ronda}
                        </span>
                        <span className="min-w-0 truncate text-sm text-tinta">
                          {j.es_local ? "vs" : "@"} {j.rival}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 pl-1 sm:pl-0">
                        {/* El marcador con ancho fijo para que todos queden en columna:
                            en una lista de once jornadas, cifras que bailan de sitio
                            obligan a buscar cada una. */}
                        <span className="w-16 text-right text-sm font-semibold tabular-nums text-tinta">
                          {marcador ? `${marcador.texto}${marcador.parcial ? "*" : ""}` : ""}
                        </span>
                        <span className="w-16 text-right text-xs text-tinta-suave">
                          {formatearFechaCorta(j.fecha_hora)}
                        </span>
                        {/* La convocatoria del capitán es un dato secundario, así que va
                            en tono suave: en azul sólido pesaba más que el estado de la
                            jornada, que es lo que de verdad importa de la fila. */}
                        {conConvocatoria.has(j.id) && (
                          <span
                            title="El capitán publicó la convocatoria en la app"
                            className="shrink-0 rounded-full bg-tarjeta-suave px-2 py-0.5 text-xs font-medium text-tinta-suave ring-1 ring-borde"
                          >
                            Conv.
                          </span>
                        )}
                        <ChipEstado estado={j.estado as Estado} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        </section>

        {(standings ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              Clasificación
            </h2>
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
      </Contenedor>
    </main>
  );
}
