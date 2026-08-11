import { createServerSupabase } from "@/lib/supabase/server";
import { Cabecera } from "@/components/ui/Cabecera";
import { formatearRangoFechas, hoyISO } from "@/lib/torneos/fechas";
import { resumenTransporte, type Estado } from "@/lib/torneos/coches";
import { PanelTorneos, type TorneoAdmin } from "./PanelTorneos";
import { Contenedor } from "@/components/ui/Contenedor";

type Asistencia = "voy" | "no_voy" | "duda";

export default async function AdminTorneosPage() {
  // El layout de /club/(vinculado)/admin ya ha comprobado que quien llega es
  // admin, y las policies de `tournaments` solo dejan escribir a admin.
  const supabase = await createServerSupabase();
  const hoy = hoyISO();

  const { data: torneos } = await supabase
    .from("tournaments")
    .select(
      "id, nombre, fecha_inicio, fecha_fin, lugar, organizador, hora, ritmo, info_extra, url_bases, de_interes, origen"
    )
    .gte("fecha_fin", hoy)
    // CRONOLÓGICO, no los marcados primero: la pantalla es una agenda por meses
    // (petición del propietario) y en una agenda manda la fecha. Los marcados se
    // distinguen resaltados, no reordenados.
    .order("fecha_inicio");

  const ids = (torneos ?? []).map((t) => t.id);

  // Asistencias y coches de todos los torneos de golpe, en tres consultas, en
  // vez de tres por torneo. El resumen de transporte se calcula con el mismo
  // módulo que usa la pantalla del socio para no tener dos criterios distintos.
  const [{ data: asistencias }, { data: coches }, { data: asientos }] =
    ids.length > 0
      ? await Promise.all([
          supabase
            .from("tournament_attendance")
            .select("tournament_id, player_id, estado")
            .in("tournament_id", ids),
          supabase
            .from("cars")
            .select("id, tournament_id, conductor_id, plazas")
            .in("tournament_id", ids),
          supabase.from("car_seats").select("car_id, player_id, tournament_id").in("tournament_id", ids),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const porTorneo = (id: string): Estado => ({
    coches: (coches ?? [])
      .filter((c) => c.tournament_id === id)
      .map((c) => ({ id: c.id, conductorId: c.conductor_id, plazas: c.plazas })),
    asientos: (asientos ?? [])
      .filter((a) => a.tournament_id === id)
      .map((a) => ({ cocheId: a.car_id, playerId: a.player_id })),
    asistencias: Object.fromEntries(
      (asistencias ?? [])
        .filter((a) => a.tournament_id === id)
        .map((a) => [a.player_id, a.estado as Asistencia])
    ),
  });

  const vista: TorneoAdmin[] = (torneos ?? []).map((t) => {
    const estado = porTorneo(t.id);
    const resumen = resumenTransporte(estado);
    return {
      id: t.id,
      nombre: t.nombre,
      fechaInicio: t.fecha_inicio,
      rango: formatearRangoFechas(t.fecha_inicio, t.fecha_fin),
      lugar: t.lugar,
      organizador: t.organizador,
      hora: t.hora,
      ritmo: t.ritmo,
      infoExtra: t.info_extra,
      urlBases: t.url_bases,
      deInteres: t.de_interes,
      esManual: t.origen === "manual",
      van: Object.values(estado.asistencias).filter((e) => e === "voy").length,
      sinPlaza: resumen.sinPlaza.length,
      plazasLibres: resumen.plazasLibres,
    };
  });

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Torneos"
        subtitulo="Calendario, a cuáles vamos y transporte"
        volverA="/club/admin" medida="panel"
      />
      <Contenedor medida="panel">
        <PanelTorneos torneos={vista} />
      </Contenedor>
    </main>
  );
}
