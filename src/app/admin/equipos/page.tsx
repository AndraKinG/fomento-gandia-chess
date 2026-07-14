import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import {
  crearEquipo,
  crearJornada,
  eliminarEquipo,
  nombrarCapitan,
  quitarCapitan,
  sincronizarCalendarioFACV,
} from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

const CAMPO =
  "rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave";

function volver(resultado: { ok?: string; error?: string }): never {
  const params = new URLSearchParams({
    msg: resultado.ok ?? resultado.error ?? "",
    tipo: resultado.ok ? "ok" : "error",
  });
  redirect(`/admin/equipos?${params.toString()}`);
}

function ChipMargen({ margenElo }: { margenElo: number | null }) {
  const texto = margenElo ? `≥${margenElo} ELO` : "Orden estricto";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
      {texto}
    </span>
  );
}

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tipo?: string }>;
}) {
  const { msg, tipo } = await searchParams;
  const supabase = await createServerSupabase();

  const { data: season } = await supabase
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();

  async function accionCrear(formData: FormData) {
    "use server";
    volver(await crearEquipo(formData));
  }

  if (!season) {
    return (
      <main className="min-h-dvh bg-fondo pb-10">
        <Cabecera titulo="Equipos y capitanes" />
        <div className="mx-auto max-w-md p-4">
          {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}
          <EstadoVacio
            icono="🛡️"
            titulo="No hay temporada activa"
            detalle='Crea una temporada sincronizando el "Orden de fuerza" antes de dar de alta equipos.'
          />
        </div>
      </main>
    );
  }

  const { data: equipos } = await supabase
    .from("teams")
    .select("id, nombre, categoria, margen_elo, num_tableros, team_captains(player_id, players(nombre))")
    .eq("season_id", season.id)
    .order("nombre");

  const { data: fichas } = await supabase
    .from("players").select("id, nombre").eq("activo", true).order("nombre");

  type Jornada = {
    id: string;
    team_id: string;
    ronda: number;
    fecha_hora: string | null;
    rival: string;
    es_local: boolean;
    sede: string | null;
    estado: string;
  };
  const idsEquipos = (equipos ?? []).map((eq) => eq.id);
  const jornadas: Jornada[] = idsEquipos.length > 0
    ? ((
        await supabase
          .from("matches")
          .select("id, team_id, ronda, fecha_hora, rival, es_local, sede, estado")
          .in("team_id", idsEquipos)
          .order("ronda")
      ).data ?? [])
    : [];
  const jornadasPorEquipo = new Map<string, Jornada[]>();
  for (const j of jornadas) {
    const lista = jornadasPorEquipo.get(j.team_id) ?? [];
    lista.push(j);
    jornadasPorEquipo.set(j.team_id, lista);
  }

  async function accionSincronizarCalendario() {
    "use server";
    const resultado = await sincronizarCalendarioFACV();
    const omitidasMsg = resultado.omitidas > 0
      ? ` (${resultado.omitidas} encuentros omitidos: equipo no registrado)`
      : "";
    const params = new URLSearchParams({
      msg: resultado.error
        ?? `Calendario sincronizado: ${resultado.creadas} jornadas creadas, ${resultado.actualizadas} actualizadas${omitidasMsg}`,
      tipo: resultado.error ? "error" : "ok",
    });
    redirect(`/admin/equipos?${params.toString()}`);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Equipos y capitanes" subtitulo={season.nombre} />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}

        <Tarjeta>
          <form action={accionCrear} className="flex flex-col gap-3">
            <p className="font-semibold text-tinta">Nuevo equipo</p>
            <input
              name="nombre" required placeholder="Nombre (ej. Fomento de Gandia B)"
              className={CAMPO}
            />
            <input
              name="categoria" required placeholder="Categoría (ej. 1ª Prov. Valencia Sur)"
              className={CAMPO}
            />
            <select name="margen_elo" defaultValue="" className={CAMPO}>
              <option value="">Sin margen (orden estricto)</option>
              <option value="100">≥100 ELO (División de Honor)</option>
              <option value="200">≥200 ELO (Autonómicas)</option>
            </select>
            <input
              name="num_tableros" type="number" min={1} defaultValue={8} required
              placeholder="Número de tableros"
              className={CAMPO}
            />
            <button className="rounded-xl bg-acento-fuerte p-3 font-semibold text-sobre-acento">
              Crear equipo
            </button>
          </form>
        </Tarjeta>

        <form action={accionSincronizarCalendario}>
          <button className="w-full rounded-xl bg-degradado-club p-3 font-semibold text-sobre-acento">
            Importar calendario FACV
          </button>
        </form>

        {(equipos ?? []).length === 0 ? (
          <EstadoVacio titulo="Todavía no hay equipos" detalle="Da de alta el primero con el formulario de arriba." />
        ) : (
          (equipos ?? []).map((eq) => {
            const capitanes = (eq.team_captains ?? []) as unknown as {
              player_id: string;
              players: { nombre: string } | null;
            }[];
            const yaCapitanes = new Set(capitanes.map((c) => c.player_id));
            const disponibles = (fichas ?? []).filter((f) => !yaCapitanes.has(f.id));

            return (
              <Tarjeta key={eq.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-tinta">{eq.nombre}</p>
                    <p className="text-sm text-tinta-suave">{eq.categoria}</p>
                  </div>
                  <ChipMargen margenElo={eq.margen_elo} />
                </div>
                <p className="text-xs text-tinta-suave">{eq.num_tableros} tableros</p>

                <div className="flex flex-col gap-1.5">
                  {capitanes.length === 0 ? (
                    <p className="text-sm text-tinta-suave">Sin capitán asignado</p>
                  ) : (
                    capitanes.map((c) => (
                      <div
                        key={c.player_id}
                        className="flex items-center justify-between rounded-xl bg-tarjeta-suave px-3 py-1.5"
                      >
                        <span className="text-sm text-tinta">
                          {c.players?.nombre ?? "—"} · capitán
                        </span>
                        <form
                          action={async () => {
                            "use server";
                            volver(await quitarCapitan(eq.id, c.player_id));
                          }}
                        >
                          <button
                            type="submit"
                            aria-label="Quitar capitán"
                            className="text-tinta-suave hover:text-tinta"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    ))
                  )}
                </div>

                {disponibles.length > 0 && (
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      const playerId = String(formData.get("playerId") ?? "");
                      volver(await nombrarCapitan(eq.id, playerId));
                    }}
                    className="flex gap-2"
                  >
                    <select name="playerId" required className={`min-w-0 flex-1 ${CAMPO}`}>
                      <option value="">Elige una ficha…</option>
                      {disponibles.map((f) => (
                        <option key={f.id} value={f.id}>{f.nombre}</option>
                      ))}
                    </select>
                    <button className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-medium text-sobre-acento">
                      Nombrar capitán
                    </button>
                  </form>
                )}

                <form
                  action={async () => {
                    "use server";
                    volver(await eliminarEquipo(eq.id));
                  }}
                >
                  <button className="text-xs text-tinta-suave underline underline-offset-2 hover:text-tinta">
                    Eliminar equipo
                  </button>
                </form>

                {(() => {
                  const propiasJornadas = jornadasPorEquipo.get(eq.id) ?? [];
                  return (
                    <div className="flex flex-col gap-2 border-t border-borde pt-3">
                      <p className="text-sm font-medium text-tinta">Jornadas</p>
                      {propiasJornadas.length === 0 ? (
                        <p className="text-sm text-tinta-suave">
                          Sin jornadas todavía. Impórtalas de la FACV o añádelas a mano abajo.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {propiasJornadas.map((j) => (
                            <li
                              key={j.id}
                              className="flex items-center justify-between rounded-xl bg-tarjeta-suave px-3 py-1.5 text-sm"
                            >
                              <span className="text-tinta">
                                R{j.ronda} · {j.es_local ? "vs" : "@"} {j.rival}
                              </span>
                              <span className="text-xs text-tinta-suave">
                                {formatearFechaMadrid(j.fecha_hora, {
                                  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <details className="rounded-xl border border-borde p-3">
                        <summary className="cursor-pointer text-sm font-medium text-tinta">
                          Añadir jornada
                        </summary>
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            formData.set("team_id", eq.id);
                            volver(await crearJornada(formData));
                          }}
                          className="mt-3 flex flex-col gap-2"
                        >
                          <input
                            name="ronda" type="number" min={1} required placeholder="Ronda"
                            className={CAMPO}
                          />
                          <input name="fecha" type="datetime-local" className={CAMPO} />
                          <input name="rival" required placeholder="Rival (ej. Sueca)" className={CAMPO} />
                          <select name="es_local" required defaultValue="" className={CAMPO}>
                            <option value="" disabled>¿Local o visitante?</option>
                            <option value="true">Local</option>
                            <option value="false">Visitante</option>
                          </select>
                          <input name="sede" placeholder="Sede (opcional)" className={CAMPO} />
                          <button className="rounded-xl bg-acento-fuerte p-2.5 text-sm font-semibold text-sobre-acento">
                            Añadir jornada
                          </button>
                        </form>
                      </details>
                    </div>
                  );
                })()}
              </Tarjeta>
            );
          })
        )}
      </div>
    </main>
  );
}
