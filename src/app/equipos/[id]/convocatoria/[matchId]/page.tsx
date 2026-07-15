import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { esCapitanDeMatch } from "@/lib/auth/es-capitan";
import { cargarContextoValidacion, type ContextoValidacion } from "@/lib/convocatorias/contexto-bd";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import type { TableroPropuesto } from "@/lib/validador";
import { EditorConvocatoria } from "./EditorConvocatoria";

type Estado = "disponible" | "no_disponible" | "duda";

/**
 * Server page (Task 6): guard (capitán del equipo de la jornada o admin),
 * carga de contexto/orden/config (Task 4) más el borrador o publicación
 * existente y la disponibilidad de la plantilla para esta jornada, todo
 * serializado como props al editor cliente (`validar()` corre en el
 * navegador con estos mismos datos — módulo puro, ver `lib/validador`).
 */
export default async function ConvocatoriaPage({
  params,
}: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;

  const [tieneCapitania, admin] = await Promise.all([esCapitanDeMatch(matchId), esAdmin()]);
  if (!tieneCapitania && !admin) redirect(`/equipos/${id}`);

  let contexto: ContextoValidacion | null = null;
  try {
    contexto = await cargarContextoValidacion(matchId);
  } catch {
    contexto = null;
  }
  if (!contexto) redirect(`/equipos/${id}`);
  const { orden, config, ctx, match } = contexto;

  // La jornada del matchId debe pertenecer al equipo de la URL (defensa en
  // profundidad: evita una convocatoria servida bajo el equipo equivocado
  // aunque el capitán/admin tenga permiso sobre ambos).
  if (match.teamId !== id) redirect(`/equipos/${id}`);

  const supabase = await createServerSupabase();

  const [{ data: lineup }, { data: disponibilidades }] = await Promise.all([
    supabase
      .from("lineups")
      .select("estado, lineup_boards(tablero, player_id)")
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase.from("availability").select("player_id, estado").eq("match_id", matchId),
  ]);

  type LineupBoardFila = { tablero: number; player_id: string };
  const tablerosIniciales: TableroPropuesto[] = (
    (lineup?.lineup_boards ?? []) as unknown as LineupBoardFila[]
  ).map((b) => ({ tablero: b.tablero, playerId: b.player_id }));
  const estadoInicial = (lineup?.estado as "borrador" | "publicada" | undefined) ?? "borrador";

  const disponibilidad: Record<string, Estado> = {};
  for (const d of disponibilidades ?? []) disponibilidad[d.player_id as string] = d.estado as Estado;

  const fecha = formatearFechaMadrid(match.fechaHora, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="min-h-dvh bg-fondo pb-24">
      <Cabecera
        titulo="Convocatoria"
        subtitulo={`${match.equipoNombre} · ${match.esLocal ? "vs" : "@"} ${match.rival} · ${fecha}`}
        volverA={`/equipos/${id}`}
      />
      <div className="mx-auto max-w-md p-4">
        <EditorConvocatoria
          matchId={matchId}
          orden={orden}
          config={config}
          ctx={ctx}
          esLocal={match.esLocal}
          jugado={match.estado === "jugado"}
          tablerosIniciales={tablerosIniciales}
          estadoInicial={estadoInicial}
          disponibilidad={disponibilidad}
        />
      </div>
    </main>
  );
}
