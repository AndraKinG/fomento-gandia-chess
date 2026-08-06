import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { estaEnCurso, formatearRangoFechas, haTerminado } from "@/lib/torneos/fechas";
import { plazasLibres, resumenTransporte, type Estado } from "@/lib/torneos/coches";
import { SelectorAsistencia } from "../SelectorAsistencia";
import { BloqueCoches, type CocheVista } from "../BloqueCoches";
import { Contenedor } from "@/components/ui/Contenedor";

type Asistencia = "voy" | "no_voy" | "duda";

export default async function TorneoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const { data: torneo } = await supabase
    .from("tournaments")
    .select("id, nombre, fecha_inicio, fecha_fin, lugar, organizador, hora, ritmo, info_extra, url_bases")
    .eq("id", id)
    .maybeSingle();
  if (!torneo) redirect("/club/torneos/facv");

  const [{ data: coches }, { data: asientos }, { data: asistencias }, { data: jugadores }] =
    await Promise.all([
      supabase
        .from("cars")
        .select("id, conductor_id, plazas, hora_salida, punto_salida, notas")
        .eq("tournament_id", id)
        .order("created_at"),
      supabase.from("car_seats").select("car_id, player_id").eq("tournament_id", id),
      supabase
        .from("tournament_attendance")
        .select("player_id, estado")
        .eq("tournament_id", id),
      supabase.from("players").select("id, nombre"),
    ]);

  const nombre = new Map((jugadores ?? []).map((j) => [j.id, j.nombre]));

  // Mismo estado que consume el módulo de reglas, para no calcular dos veces lo
  // mismo con criterios distintos entre la pantalla y el servidor.
  const estado: Estado = {
    coches: (coches ?? []).map((c) => ({
      id: c.id,
      conductorId: c.conductor_id,
      plazas: c.plazas,
      horaSalida: c.hora_salida,
      puntoSalida: c.punto_salida,
    })),
    asientos: (asientos ?? []).map((a) => ({ cocheId: a.car_id, playerId: a.player_id })),
    asistencias: Object.fromEntries(
      (asistencias ?? []).map((a) => [a.player_id, a.estado as Asistencia])
    ),
  };

  const yo = sesion?.playerId ?? null;
  const miAsistencia = yo ? (estado.asistencias[yo] ?? null) : null;
  const miAsiento = estado.asientos.find((a) => a.playerId === yo);
  const conduzco = estado.coches.some((c) => c.conductorId === yo);

  const vista: CocheVista[] = (coches ?? []).map((c) => {
    const delCoche = estado.asientos.filter((a) => a.cocheId === c.id);
    return {
      id: c.id,
      conductorNombre: nombre.get(c.conductor_id) ?? "Socio",
      esMiCoche: c.conductor_id === yo,
      plazas: c.plazas,
      libres: plazasLibres(
        { id: c.id, conductorId: c.conductor_id, plazas: c.plazas },
        estado.asientos
      ),
      horaSalida: c.hora_salida,
      puntoSalida: c.punto_salida,
      notas: c.notas,
      pasajeros: delCoche.map((a) => nombre.get(a.playerId) ?? "Socio"),
      voyEnEste: miAsiento?.cocheId === c.id,
    };
  });

  const van = Object.entries(estado.asistencias)
    .filter(([, e]) => e === "voy")
    .map(([p]) => nombre.get(p) ?? "Socio")
    .sort();
  const dudan = Object.entries(estado.asistencias)
    .filter(([, e]) => e === "duda")
    .map(([p]) => nombre.get(p) ?? "Socio")
    .sort();

  const resumen = resumenTransporte(estado);
  const terminado = haTerminado(torneo.fecha_fin);
  const enCurso = estaEnCurso(torneo.fecha_inicio, torneo.fecha_fin);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={torneo.nombre}
        subtitulo={formatearRangoFechas(torneo.fecha_inicio, torneo.fecha_fin)}
        volverA="/club/torneos/facv"
      />
      <Contenedor medida="lectura" className="space-y-4">
        {enCurso && <Banner tipo="ok">Se está jugando ahora mismo.</Banner>}
        {terminado && <Banner tipo="aviso">Este torneo ya ha terminado.</Banner>}

        <Tarjeta>
          <dl className="space-y-1.5 text-sm">
            {torneo.lugar && (
              <div className="flex gap-2">
                <dt className="text-tinta-suave">Lugar</dt>
                <dd className="text-tinta">{torneo.lugar}</dd>
              </div>
            )}
            {torneo.hora && (
              <div className="flex gap-2">
                <dt className="text-tinta-suave">Hora</dt>
                <dd className="text-tinta">{torneo.hora}</dd>
              </div>
            )}
            {torneo.ritmo && (
              <div className="flex gap-2">
                <dt className="text-tinta-suave">Ritmo</dt>
                <dd className="text-tinta">{torneo.ritmo}</dd>
              </div>
            )}
            {torneo.organizador && (
              <div className="flex gap-2">
                <dt className="text-tinta-suave">Organiza</dt>
                <dd className="text-tinta">{torneo.organizador}</dd>
              </div>
            )}
          </dl>
          {torneo.info_extra && (
            <p className="mt-3 whitespace-pre-line text-sm text-tinta">{torneo.info_extra}</p>
          )}
          {torneo.url_bases && (
            <p className="mt-3 text-sm">
              <a
                href={torneo.url_bases}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-acento-texto underline"
              >
                Ver las bases del torneo
              </a>
            </p>
          )}
        </Tarjeta>

        {!terminado && yo && (
          <Tarjeta destacada>
            <p className="mb-2 font-semibold text-tinta">¿Vas a este torneo?</p>
            <SelectorAsistencia tournamentId={torneo.id} valorInicial={miAsistencia} />
          </Tarjeta>
        )}

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Quién va
          </h2>
          <Tarjeta compacta>
            {van.length === 0 && dudan.length === 0 ? (
              <p className="text-sm text-tinta-suave">Todavía no ha dicho nadie que va.</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {van.length > 0 && (
                  <p className="text-tinta">
                    <span className="text-tinta-suave">✅ Van ({van.length}): </span>
                    {van.join(", ")}
                  </p>
                )}
                {dudan.length > 0 && (
                  <p className="text-tinta">
                    <span className="text-tinta-suave">🤔 En duda ({dudan.length}): </span>
                    {dudan.join(", ")}
                  </p>
                )}
              </div>
            )}
          </Tarjeta>
        </section>

        {!terminado && resumen.faltanPlazas && (
          <Banner tipo="aviso">
            Hay {resumen.sinPlaza.length}{" "}
            {resumen.sinPlaza.length === 1 ? "persona" : "personas"} sin sitio y solo{" "}
            {resumen.plazasLibres}{" "}
            {resumen.plazasLibres === 1 ? "plaza libre" : "plazas libres"}. Hace falta
            otro coche.
          </Banner>
        )}

        {!terminado && (
          <BloqueCoches
            tournamentId={torneo.id}
            coches={vista}
            // Ofrecer coche exige ir al torneo y no estar ya conduciendo ni
            // viajando. La condición se calcula aquí y no en el cliente para que
            // la pantalla y el servidor no puedan discrepar.
            puedoOfrecer={
              !!yo &&
              (miAsistencia === "voy" || miAsistencia === "duda") &&
              !conduzco &&
              !miAsiento
            }
            voyEnAlgunCoche={!!miAsiento || conduzco}
          />
        )}
      </Contenedor>
    </main>
  );
}
