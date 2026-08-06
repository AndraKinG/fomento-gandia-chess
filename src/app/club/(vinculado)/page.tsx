import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { TarjetaJornada } from "@/components/ui/TarjetaJornada";
import { Boton } from "@/components/ui/Boton";
import { formatearRangoFechas, hoyISO } from "@/lib/torneos/fechas";
import { Contenedor, Rejilla } from "@/components/ui/Contenedor";

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

/**
 * Inicio de la zona de socios: resumen de lo que pasa en el club.
 *
 * LAS CONSULTAS VAN EN DOS TANDAS, no en fila. Esta pantalla necesitaba diez
 * viajes a Supabase uno detrás de otro, y la app no pintaba nada hasta el
 * último: es la pantalla más visitada y era la que peor se sentía. Ahora son dos
 * tandas en paralelo, y en cada una la espera es la de la consulta más lenta en
 * vez de la suma de todas.
 *
 * La primera tanda son las consultas que solo dependen de quién eres; la segunda,
 * las que necesitan un id que sale de la primera.
 */
export default async function Home() {
  const supabase = await createServerSupabase();
  // `sesionActual()` está memoizada por petición y el layout ya la ha llamado, así
  // que esto no cuesta ningún viaje: sale gratis el usuario, el email y la ficha,
  // que antes eran dos consultas propias de esta pantalla.
  const sesion = await sesionActual();
  const playerId = sesion?.playerId ?? null;

  const ahora = new Date();
  const ahoraISO = ahora.toISOString();
  const dentroVentanaISO = new Date(ahora.getTime() + DIEZ_DIAS_MS).toISOString();

  const [{ data: pendientes }, { data: proximas }, { data: torneosProximos }, { data: jornadasVentana }] =
    await Promise.all([
      // Solo si no hay ficha: al vinculado ya no le sirve de nada saber si tiene
      // una solicitud pendiente, y era una consulta para todo el club cada vez
      // que alguien abría la app.
      playerId
        ? Promise.resolve({ data: [] as { id: string }[] })
        : supabase
            .from("link_requests")
            .select("id")
            .eq("user_id", sesion!.userId)
            .eq("status", "pendiente")
            .limit(1),
      supabase
        .from("matches")
        .select("id, ronda, fecha_hora, rival, es_local, sede, teams(nombre)")
        .eq("estado", "pendiente")
        .gte("fecha_hora", ahoraISO)
        .order("fecha_hora")
        .limit(1),
      // Próximos torneos a los que va el club. El Interclubs duerme de abril a
      // enero, así que fuera de esa ventana esto es lo único que la app tiene que
      // contar: sin ello, la home queda vacía media temporada.
      supabase
        .from("tournaments")
        .select("id, nombre, fecha_inicio, fecha_fin, lugar")
        .eq("de_interes", true)
        .gte("fecha_fin", hoyISO())
        .order("fecha_inicio")
        .limit(3),
      playerId
        ? supabase
            .from("matches")
            .select("id")
            .eq("estado", "pendiente")
            .gte("fecha_hora", ahoraISO)
            .lt("fecha_hora", dentroVentanaISO)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);

  const pendiente = (pendientes ?? []).length > 0;
  const proxima = (proximas ?? [])[0] as unknown as {
    id: string; ronda: number; fecha_hora: string; rival: string; es_local: boolean;
    sede: string | null; teams: { nombre: string } | null;
  } | undefined;

  const idsTorneos = (torneosProximos ?? []).map((t) => t.id);
  const idsVentana = (jornadasVentana ?? []).map((j) => j.id);

  const [{ data: misAsistencias }, miDisponibilidad, { data: misDisponibilidades }] =
    await Promise.all([
      playerId && idsTorneos.length > 0
        ? supabase
            .from("tournament_attendance")
            .select("tournament_id, estado")
            .eq("player_id", playerId)
            .in("tournament_id", idsTorneos)
        : Promise.resolve({ data: [] as { tournament_id: string; estado: string }[] }),
      playerId && proxima
        ? supabase
            .from("availability")
            .select("estado")
            .eq("match_id", proxima.id)
            .eq("player_id", playerId)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      playerId && idsVentana.length > 0
        ? supabase
            .from("availability")
            .select("match_id, estado")
            .eq("player_id", playerId)
            .in("match_id", idsVentana)
        : Promise.resolve({ data: [] as { match_id: string; estado: string }[] }),
    ]);

  const asistenciaPorTorneo = new Map(
    (misAsistencias ?? []).map((a) => [a.tournament_id, a.estado as string])
  );
  const miEstado = (miDisponibilidad?.estado as Estado | undefined) ?? null;
  const respondidas = new Set((misDisponibilidades ?? []).map((d) => d.match_id));
  const faltaDisponibilidad = idsVentana.some((id) => !respondidas.has(id));

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Fomento de Gandia" subtitulo={`Hola, ${sesion?.email ?? ""}`} medida="panel" />
      <Contenedor medida="panel" className="space-y-4">
        {!playerId && !pendiente && (
          <Banner tipo="aviso">
            Aún no estás vinculado a tu ficha del club →{" "}
            <Link href="/club/vincular" className="font-semibold underline">
              hazlo aquí
            </Link>
          </Banner>
        )}
        {!playerId && pendiente && (
          <Banner tipo="ok">
            Solicitud de vinculación pendiente de aprobación.
          </Banner>
        )}

        {proxima ? (
          <>
            <Link href={`/club/jornadas/${proxima.id}`} className="block">
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
                    {playerId && (
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
            <Rejilla columnas={3}>
              {(torneosProximos ?? []).map((t) => {
                const estado = asistenciaPorTorneo.get(t.id);
                return (
                  <Link key={t.id} href={`/club/torneos/${t.id}`} className="block h-full">
                    <Tarjeta
                      compacta
                      className="flex h-full items-center justify-between gap-3 transition hover:border-borde-acento"
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
            </Rejilla>
          </section>
        )}
      </Contenedor>
    </main>
  );
}
