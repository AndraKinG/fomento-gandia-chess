import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
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

  const [{ data: esCapitan }, admin, { data: jornadas }] = await Promise.all([
    supabase.rpc("es_capitan_de", { equipo: id }),
    esAdmin(),
    supabase
      .from("matches")
      .select("id, ronda, fecha_hora, rival, es_local, sede, estado")
      .eq("team_id", id)
      .order("ronda"),
  ]);
  const puedeGestionar = Boolean(esCapitan) || admin;

  // Chip "Conv." (Task 6): un extra query barata para saber qué jornadas ya
  // tienen convocatoria publicada (la RLS de `lineups` ya permite leer las
  // publicadas a cualquier usuario autenticado).
  const idsJornadas = (jornadas ?? []).map((j) => j.id);
  const { data: lineupsPublicadas } = idsJornadas.length > 0
    ? await supabase.from("lineups").select("match_id").eq("estado", "publicada").in("match_id", idsJornadas)
    : { data: [] };
  const conConvocatoria = new Set((lineupsPublicadas ?? []).map((l) => l.match_id));

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
      </div>
    </main>
  );
}
