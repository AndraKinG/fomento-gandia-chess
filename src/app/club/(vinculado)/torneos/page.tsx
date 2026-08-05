import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { formatearRangoFechas, hoyISO } from "@/lib/torneos/fechas";

type Asistencia = "voy" | "no_voy" | "duda";

const ICONO: Record<Asistencia, string> = { voy: "✅", no_voy: "❌", duda: "🤔" };

export default async function TorneosPage({
  searchParams,
}: {
  searchParams: Promise<{ todos?: string; pasados?: string }>;
}) {
  const { todos, pasados } = await searchParams;
  const verTodos = todos === "1";
  const verPasados = pasados === "1";

  const supabase = await createServerSupabase();
  const sesion = await sesionActual();
  const hoy = hoyISO();

  // Por defecto solo los marcados de interés por el admin: la FACV publica casi
  // 170 torneos al año y volcarlos todos aquí no ayudaría a nadie.
  let consulta = supabase
    .from("tournaments")
    .select("id, nombre, fecha_inicio, fecha_fin, lugar, hora, ritmo, de_interes");

  consulta = verPasados
    ? consulta.lt("fecha_fin", hoy).order("fecha_inicio", { ascending: false }).limit(50)
    : consulta.gte("fecha_fin", hoy).order("fecha_inicio");

  if (!verTodos && !verPasados) consulta = consulta.eq("de_interes", true);

  const { data: torneos } = await consulta;

  // Mi asistencia, solo de los torneos que se van a mostrar.
  const ids = (torneos ?? []).map((t) => t.id);
  const { data: mias } =
    sesion?.playerId && ids.length > 0
      ? await supabase
          .from("tournament_attendance")
          .select("tournament_id, estado")
          .eq("player_id", sesion.playerId)
          .in("tournament_id", ids)
      : { data: [] };
  const miEstado = new Map(
    (mias ?? []).map((a) => [a.tournament_id, a.estado as Asistencia])
  );

  const titulo = verPasados ? "Torneos pasados" : verTodos ? "Todo el calendario" : "Torneos";

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={titulo}
        subtitulo={verPasados ? undefined : "A los que vamos como club"}
        volverA={verTodos || verPasados ? "/club/torneos" : "/club"}
      />
      <div className="mx-auto max-w-md space-y-3 p-4 sm:max-w-2xl">
        {(torneos ?? []).length === 0 && (
          <EstadoVacio
            icono="🏆"
            titulo={verPasados ? "Aún no hay torneos pasados" : "No hay torneos a la vista"}
            detalle={
              verTodos || verPasados
                ? undefined
                : "Cuando el club decida ir a algún torneo, aparecerá aquí con quién va y quién lleva coche."
            }
          />
        )}

        <ul className="space-y-3">
          {(torneos ?? []).map((t) => {
            const estado = miEstado.get(t.id);
            return (
              <li key={t.id}>
                <Link href={`/club/torneos/${t.id}`} className="block">
                  <Tarjeta className="transition hover:border-borde-acento">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-tinta">{t.nombre}</p>
                        <p className="mt-0.5 text-sm text-tinta-suave">
                          {formatearRangoFechas(t.fecha_inicio, t.fecha_fin)}
                          {t.hora ? ` · ${t.hora}` : ""}
                        </p>
                        {t.lugar && (
                          <p className="text-sm text-tinta-suave">{t.lugar}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {t.ritmo && (
                          <span className="rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
                            {t.ritmo}
                          </span>
                        )}
                        {estado && (
                          <span className="text-xs text-tinta-suave">
                            {ICONO[estado]}{" "}
                            {estado === "voy" ? "Vas" : estado === "no_voy" ? "No vas" : "Duda"}
                          </span>
                        )}
                      </div>
                    </div>
                  </Tarjeta>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          {!verTodos && !verPasados && (
            <Link href="/club/torneos?todos=1" className="text-acento-texto underline">
              Ver todo el calendario FACV
            </Link>
          )}
          {!verPasados && (
            <Link href="/club/torneos?pasados=1" className="text-acento-texto underline">
              Torneos pasados
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
