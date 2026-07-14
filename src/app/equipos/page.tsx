import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

type Jornada = {
  id: string;
  ronda: number;
  fecha_hora: string | null;
  rival: string;
  es_local: boolean;
};

type Capitan = { player_id: string; players: { nombre: string } | null };

function ChipMargen({ margenElo }: { margenElo: number | null }) {
  const texto = margenElo ? `≥${margenElo} ELO` : "Orden estricto";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
      {texto}
    </span>
  );
}

function formatearFechaCorta(fechaHoraISO: string | null): string {
  if (!fechaHoraISO) return "Sin fecha";
  const fecha = new Date(fechaHoraISO);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/** Próximas 2 jornadas (fecha futura) o, si no quedan, las últimas 2 jugadas. */
function resumenJornadas(jornadas: Jornada[]): Jornada[] {
  const ahora = Date.now();
  const futuras = jornadas
    .filter((j) => j.fecha_hora && new Date(j.fecha_hora).getTime() >= ahora)
    .sort((a, b) => new Date(a.fecha_hora!).getTime() - new Date(b.fecha_hora!).getTime());
  if (futuras.length > 0) return futuras.slice(0, 2);
  return [...jornadas]
    .filter((j) => j.fecha_hora)
    .sort((a, b) => new Date(b.fecha_hora!).getTime() - new Date(a.fecha_hora!).getTime())
    .slice(0, 2);
}

export default async function EquiposPage() {
  const supabase = await createServerSupabase();
  const { data: season } = await supabase
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();

  if (!season) {
    return (
      <main className="min-h-dvh bg-fondo pb-10">
        <Cabecera titulo="Equipos" subtitulo="Interclubs FACV" />
        <div className="mx-auto max-w-md p-4">
          <EstadoVacio
            titulo="Los equipos llegan con el interclubs"
            detalle="Aquí verás calendario, clasificación y convocatorias de los equipos A, B y C"
          />
        </div>
      </main>
    );
  }

  const { data: equipos } = await supabase
    .from("teams")
    .select("id, nombre, categoria, margen_elo, team_captains(player_id, players(nombre))")
    .eq("season_id", season.id)
    .order("nombre");

  const idsEquipos = (equipos ?? []).map((eq) => eq.id);
  const { data: jornadas } = idsEquipos.length > 0
    ? await supabase
        .from("matches")
        .select("id, team_id, ronda, fecha_hora, rival, es_local")
        .in("team_id", idsEquipos)
        .order("fecha_hora")
    : { data: [] };

  const jornadasPorEquipo = new Map<string, Jornada[]>();
  for (const j of jornadas ?? []) {
    const lista = jornadasPorEquipo.get(j.team_id) ?? [];
    lista.push(j);
    jornadasPorEquipo.set(j.team_id, lista);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Equipos" subtitulo={season.nombre} />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {(equipos ?? []).length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay equipos"
            detalle="El club aún no ha dado de alta ningún equipo para esta temporada"
          />
        ) : (
          (equipos ?? []).map((eq) => {
            const capitanes = (eq.team_captains ?? []) as unknown as Capitan[];
            const resumen = resumenJornadas(jornadasPorEquipo.get(eq.id) ?? []);
            return (
              <Link key={eq.id} href={`/equipos/${eq.id}`}>
                <Tarjeta className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-tinta">{eq.nombre}</p>
                      <p className="text-sm text-tinta-suave">{eq.categoria}</p>
                    </div>
                    <ChipMargen margenElo={eq.margen_elo} />
                  </div>

                  <p className="text-sm text-tinta-suave">
                    {capitanes.length === 0
                      ? "Sin capitán asignado"
                      : `Capitán: ${capitanes.map((c) => c.players?.nombre ?? "—").join(", ")}`}
                  </p>

                  {resumen.length > 0 && (
                    <ul className="flex flex-col gap-1.5 border-t border-borde pt-2">
                      {resumen.map((j) => (
                        <li key={j.id} className="flex items-center justify-between text-sm">
                          <span className="text-tinta">
                            R{j.ronda} · {j.es_local ? "vs" : "@"} {j.rival}
                          </span>
                          <span className="text-xs text-tinta-suave">{formatearFechaCorta(j.fecha_hora)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
