import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { formatearRangoFechas, hoyISO } from "@/lib/torneos/fechas";
import { CrearTorneo } from "./CrearTorneo";
import { Contenedor, REJILLA } from "@/components/ui/Contenedor";
import { PestanasTorneos } from "@/components/ui/Pestanas";

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

  // Qué torneos son "del club": aquellos a los que ALGUIEN ha dicho que va o que
  // duda, más los que el admin haya destacado a mano. La FACV publica casi 170
  // torneos al año, así que la lista no puede ser el calendario entero — pero
  // tampoco hace falta que nadie cure nada: **el primero que dice que va saca el
  // torneo a la luz para los demás**, y a partir de ahí se organizan los coches.
  //
  // Se calcula de las asistencias en vez de escribir una marca al apuntarse: una
  // marca guardada se queda a true cuando el último que iba se borra, y la lista
  // acabaría llena de torneos a los que ya no va nadie.
  let consulta = supabase
    .from("tournaments")
    .select("id, nombre, fecha_inicio, fecha_fin, lugar, hora, ritmo, de_interes");

  consulta = verPasados
    ? consulta.lt("fecha_fin", hoy).order("fecha_inicio", { ascending: false }).limit(50)
    : consulta.gte("fecha_fin", hoy).order("fecha_inicio");

  // Las dos en paralelo: ninguna necesita el resultado de la otra, y en fila la
  // pantalla esperaba la suma de las dos para no pintar nada.
  const [{ data: conGente }, { data: todosLosTorneos }] = await Promise.all([
    supabase
      .from("tournament_attendance")
      .select("tournament_id, estado")
      .in("estado", ["voy", "duda"]),
    consulta,
  ]);
  const idsConGente = new Set((conGente ?? []).map((a) => a.tournament_id));

  const torneos =
    verTodos || verPasados
      ? (todosLosTorneos ?? [])
      : (todosLosTorneos ?? []).filter((t) => t.de_interes || idsConGente.has(t.id));

  // Mi asistencia, solo de los torneos que se van a mostrar.
  const ids = torneos.map((t) => t.id);
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

  // Cuánta gente va a cada torneo, para que la tarjeta lo diga sin abrirla.
  const cuantosVan = new Map<string, number>();
  for (const a of conGente ?? []) {
    if (a.estado !== "voy") continue;
    cuantosVan.set(a.tournament_id, (cuantosVan.get(a.tournament_id) ?? 0) + 1);
  }

  const titulo = verPasados ? "Torneos pasados" : verTodos ? "Todo el calendario" : "Torneos";

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      {/* Sin flecha de volver en la raíz de la sección: para eso está la barra de
          pestañas, igual que en Interclubs. Solo la llevan las subvistas. */}
      <Cabecera
        titulo={titulo}
        subtitulo={verPasados ? undefined : "A los que vamos como club"}
        volverA={verTodos || verPasados ? "/club/torneos/facv" : undefined} medida="panel"
      />
      <Contenedor medida="panel" className="space-y-3">
        <PestanasTorneos activa="facv" />

        {torneos.length === 0 && (
          <EstadoVacio
            icono="🏆"
            titulo={verPasados ? "Aún no hay torneos pasados" : "Todavía nadie va a ningún torneo"}
            detalle={
              verTodos || verPasados
                ? undefined
                : "Mira el calendario completo y di que vas a alguno: en cuanto lo hagas aparecerá aquí para el resto del club."
            }
          />
        )}

        <ul className={REJILLA[2]}>
          {torneos.map((t) => {
            const estado = miEstado.get(t.id);
            const van = cuantosVan.get(t.id) ?? 0;
            return (
              <li key={t.id}>
                <Link href={`/club/torneos/facv/${t.id}`} className="block h-full">
                  <Tarjeta className="h-full transition hover:border-borde-acento">
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
                        {van > 0 && (
                          <span className="text-xs text-tinta-suave">
                            {van} {van === 1 ? "va" : "van"}
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

        {sesion?.esJunta && !verPasados && (
          <div className="pt-2">
            <CrearTorneo />
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          {!verTodos && !verPasados && (
            <Link href="/club/torneos/facv?todos=1" className="text-acento-texto underline">
              Ver todo el calendario FACV
            </Link>
          )}
          {!verPasados && (
            <Link href="/club/torneos/facv?pasados=1" className="text-acento-texto underline">
              Torneos pasados
            </Link>
          )}
        </div>
      </Contenedor>
    </main>
  );
}
