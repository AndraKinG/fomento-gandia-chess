import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/auth/es-admin";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

type Estado = "disponible" | "no_disponible" | "duda";
const ICONOS: Record<Estado, string> = { disponible: "✅", no_disponible: "❌", duda: "🤔" };

function formatearFecha(fechaHora: string | null): string {
  if (!fechaHora) return "Sin fecha";
  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function PlantillaPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const [{ data: esCapitan }, admin] = await Promise.all([
    supabase.rpc("es_capitan_de", { equipo: id }),
    esAdmin(),
  ]);
  if (!esCapitan && !admin) redirect("/equipos");

  const { data: equipo } = await supabase
    .from("teams").select("id, nombre, season_id").eq("id", id).maybeSingle();
  if (!equipo) redirect("/equipos");

  const { data: jornadas } = await supabase
    .from("matches")
    .select("id, ronda, fecha_hora, rival, es_local")
    .eq("team_id", id)
    .eq("estado", "pendiente")
    .order("ronda");
  const propiasJornadas = jornadas ?? [];

  const { data: orden } = await supabase
    .from("force_order")
    .select("numero, bis_index, player_id, players(nombre)")
    .eq("season_id", equipo.season_id)
    .order("numero").order("bis_index");
  const propioOrden = (orden ?? []) as unknown as {
    numero: number; bis_index: number; player_id: string;
    players: { nombre: string } | null;
  }[];

  const idsJornadas = propiasJornadas.map((j) => j.id);
  const { data: disponibilidades } = idsJornadas.length > 0
    ? await supabase
        .from("availability")
        .select("match_id, player_id, estado")
        .in("match_id", idsJornadas)
    : { data: [] };

  const mapaDisp = new Map<string, Estado>();
  for (const d of disponibilidades ?? []) mapaDisp.set(`${d.match_id}:${d.player_id}`, d.estado as Estado);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Plantilla" subtitulo={equipo.nombre} />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {propiasJornadas.length === 0 || propioOrden.length === 0 ? (
          <EstadoVacio
            titulo="Nada que mostrar todavía"
            detalle="Hacen falta jornadas pendientes y un orden de fuerza para esta temporada"
          />
        ) : (
          propiasJornadas.map((j) => {
            const filas = propioOrden.map((f) => ({
              etiqueta: `${f.numero}${f.bis_index ? "bis" : ""}`,
              nombre: f.players?.nombre ?? "—",
              estado: mapaDisp.get(`${j.id}:${f.player_id}`),
            }));
            const contadores = { disponible: 0, no_disponible: 0, duda: 0, sinResponder: 0 };
            for (const f of filas) {
              if (f.estado) contadores[f.estado]++;
              else contadores.sinResponder++;
            }
            return (
              <Tarjeta key={j.id} className="flex flex-col gap-2">
                <p className="font-semibold text-tinta">
                  R{j.ronda} · {j.es_local ? "vs" : "@"} {j.rival}
                </p>
                <p className="text-xs text-tinta-suave">{formatearFecha(j.fecha_hora)}</p>
                <ul className="divide-y divide-borde">
                  {filas.map((f) => (
                    <li key={f.etiqueta} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-tinta">{f.etiqueta} · {f.nombre}</span>
                      <span aria-hidden>{f.estado ? ICONOS[f.estado] : "—"}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-tinta-suave">
                  ✅ {contadores.disponible} · ❌ {contadores.no_disponible} · 🤔 {contadores.duda} · — {contadores.sinResponder}
                </p>
              </Tarjeta>
            );
          })
        )}
      </div>
    </main>
  );
}
