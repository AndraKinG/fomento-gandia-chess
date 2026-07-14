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

function formatearFecha(fechaHoraISO: string | null): string {
  if (!fechaHoraISO || Number.isNaN(new Date(fechaHoraISO).getTime())) return "Sin fecha";
  const dia = formatearFechaMadrid(fechaHoraISO, {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  const hora = formatearFechaMadrid(fechaHoraISO, { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
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

  const capitanes = (equipo.team_captains ?? []) as unknown as {
    player_id: string;
    players: { nombre: string } | null;
  }[];

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo={equipo.nombre} subtitulo={equipo.categoria} />
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
          <div className="flex flex-col gap-3">
            {(jornadas ?? []).map((j) => (
              <Tarjeta key={j.id} className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-tinta">
                    R{j.ronda} · {j.es_local ? "vs" : "@"} {j.rival}
                  </p>
                  <ChipEstado estado={j.estado as Estado} />
                </div>
                <p className="text-sm text-tinta-suave">{formatearFecha(j.fecha_hora)}</p>
                <p className="text-sm text-tinta-suave">
                  {j.es_local ? "En casa" : "Fuera"}{j.sede ? ` · ${j.sede}` : ""}
                </p>
              </Tarjeta>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
