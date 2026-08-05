import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { TarjetaJornada } from "@/components/ui/TarjetaJornada";
import { Boton } from "@/components/ui/Boton";
import { formatearRangoFechas, hoyISO } from "@/lib/torneos/fechas";

type Estado = "disponible" | "no_disponible" | "duda";
const ICONOS: Record<Estado, string> = { disponible: "✅", no_disponible: "❌", duda: "🤔" };
const TEXTOS: Record<Estado, string> = {
  disponible: "Puedes jugar", no_disponible: "No puedes jugar", duda: "En duda",
};
const DIEZ_DIAS_MS = 10 * 24 * 60 * 60 * 1000;

function formatearFecha(fechaHoraISO: string | null): string {
  if (!fechaHoraISO || Number.isNaN(new Date(fechaHoraISO).getTime())) return "Sin fecha";
  const dia = formatearFechaMadrid(fechaHoraISO, { weekday: "short", day: "2-digit", month: "short" });
  const hora = formatearFechaMadrid(fechaHoraISO, { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user!.id).single();
  const { data: pendientes } = await supabase
    .from("link_requests").select("id").eq("user_id", user!.id)
    .eq("status", "pendiente").limit(1);
  const pendiente = (pendientes ?? []).length > 0;

  const ahora = new Date();
  const ahoraISO = ahora.toISOString();
  const { data: proximas } = await supabase
    .from("matches")
    .select("id, ronda, fecha_hora, rival, es_local, sede, teams(nombre)")
    .eq("estado", "pendiente")
    .gte("fecha_hora", ahoraISO)
    .order("fecha_hora")
    .limit(1);
  const proxima = (proximas ?? [])[0] as unknown as {
    id: string; ronda: number; fecha_hora: string; rival: string; es_local: boolean;
    sede: string | null; teams: { nombre: string } | null;
  } | undefined;

  // Próximos torneos a los que va el club. El Interclubs duerme de abril a
  // enero, así que fuera de esa ventana esto es lo único que la app tiene que
  // contar: sin ello, la home queda vacía media temporada.
  const { data: torneosProximos } = await supabase
    .from("tournaments")
    .select("id, nombre, fecha_inicio, fecha_fin, lugar")
    .eq("de_interes", true)
    .gte("fecha_fin", hoyISO())
    .order("fecha_inicio")
    .limit(3);

  const idsTorneos = (torneosProximos ?? []).map((t) => t.id);
  const { data: misAsistencias } =
    profile?.player_id && idsTorneos.length > 0
      ? await supabase
          .from("tournament_attendance")
          .select("tournament_id, estado")
          .eq("player_id", profile.player_id)
          .in("tournament_id", idsTorneos)
      : { data: [] };
  const asistenciaPorTorneo = new Map(
    (misAsistencias ?? []).map((a) => [a.tournament_id, a.estado as string])
  );

  let miEstado: Estado | null = null;
  let faltaDisponibilidad = false;
  if (profile?.player_id) {
    if (proxima) {
      const { data: miDisponibilidad } = await supabase
        .from("availability")
        .select("estado")
        .eq("match_id", proxima.id)
        .eq("player_id", profile.player_id)
        .maybeSingle();
      miEstado = (miDisponibilidad?.estado as Estado | undefined) ?? null;
    }

    const dentroVentanaISO = new Date(ahora.getTime() + DIEZ_DIAS_MS).toISOString();
    const { data: jornadasVentana } = await supabase
      .from("matches")
      .select("id")
      .eq("estado", "pendiente")
      .gte("fecha_hora", ahoraISO)
      .lt("fecha_hora", dentroVentanaISO);
    const idsVentana = (jornadasVentana ?? []).map((j) => j.id);

    if (idsVentana.length > 0) {
      const { data: misDisponibilidades } = await supabase
        .from("availability")
        .select("match_id, estado")
        .eq("player_id", profile.player_id)
        .in("match_id", idsVentana);
      const mapaRespondidas = new Map(
        (misDisponibilidades ?? []).map((d) => [d.match_id, d.estado as Estado])
      );
      faltaDisponibilidad = idsVentana.some((id) => !mapaRespondidas.has(id));
    }
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Fomento de Gandia" subtitulo={`Hola, ${user?.email}`} />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {!profile?.player_id && !pendiente && (
          <Banner tipo="aviso">
            Aún no estás vinculado a tu ficha del club →{" "}
            <Link href="/club/vincular" className="font-semibold underline">
              hazlo aquí
            </Link>
          </Banner>
        )}
        {!profile?.player_id && pendiente && (
          <Banner tipo="ok">
            Solicitud de vinculación pendiente de aprobación.
          </Banner>
        )}

        {proxima ? (
          <>
            <Link href={`/jornadas/${proxima.id}`} className="block">
              <TarjetaJornada
                equipo={proxima.teams?.nombre ?? "Equipo"}
                rival={proxima.rival}
                fechaTexto={formatearFecha(proxima.fecha_hora)}
                esLocal={proxima.es_local}
                sede={proxima.sede ?? undefined}
                extra={
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
                      Ronda {proxima.ronda}
                    </span>
                    {profile?.player_id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
                        {miEstado ? `${ICONOS[miEstado]} ${TEXTOS[miEstado]}` : "Sin responder aún"}
                      </span>
                    )}
                  </>
                }
              />
            </Link>
            {faltaDisponibilidad && (
              <Banner tipo="aviso">
                <p className="mb-2">Tienes jornadas próximas sin responder tu disponibilidad.</p>
                <Boton variante="secundario" href="/club/disponibilidad" className="text-sm">
                  Marcar disponibilidad
                </Boton>
              </Banner>
            )}
          </>
        ) : (
          <EstadoVacio
            icono="♟"
            titulo="Aún no hay jornadas"
            detalle="Cuando arranque el interclubs verás aquí tu próxima jornada"
          />
        )}

        {(torneosProximos ?? []).length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              Próximos torneos
            </h2>
            {(torneosProximos ?? []).map((t) => {
              const estado = asistenciaPorTorneo.get(t.id);
              return (
                <Link key={t.id} href={`/club/torneos/${t.id}`} className="block">
                  <Tarjeta
                    compacta
                    className="flex items-center justify-between gap-3 transition hover:border-borde-acento"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-tinta">{t.nombre}</p>
                      <p className="text-sm text-tinta-suave">
                        {formatearRangoFechas(t.fecha_inicio, t.fecha_fin)}
                        {t.lugar ? ` · ${t.lugar}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-tinta-suave">
                      {estado === "voy"
                        ? "✅ Vas"
                        : estado === "no_voy"
                          ? "❌ No vas"
                          : estado === "duda"
                            ? "🤔 Duda"
                            : "¿Vas?"}
                    </span>
                  </Tarjeta>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
