import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { SelectorDisponibilidad } from "./SelectorDisponibilidad";

type Valor = "disponible" | "no_disponible" | "duda";

function formatearFechaGrupo(fecha: string): string {
  // Mediodía UTC para que el propio cambio de día en Madrid no desplace la
  // fecha al formatear (evita el borde de las 00:00 en verano/invierno).
  const d = new Date(`${fecha}T12:00:00Z`);
  const texto = d.toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid", weekday: "long", day: "2-digit", month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function DisponibilidadPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user!.id).single();

  if (!profile?.player_id) {
    return (
      <main className="min-h-dvh bg-fondo pb-10">
        <Cabecera titulo="Disponibilidad" volverA="/" />
        <div className="mx-auto max-w-md p-4">
          <EstadoVacio
            titulo="Sin ficha vinculada todavía"
            detalle="Vincúlate a tu ficha del club para marcar tu disponibilidad"
          />
          <p className="mt-4 text-center text-sm">
            <Link href="/vincular" className="font-semibold text-acento-texto underline">
              Vincular mi ficha
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const ahora = new Date().toISOString();
  const { data: jornadas } = await supabase
    .from("matches")
    .select("id, fecha_hora, rival, es_local, teams(nombre)")
    .eq("estado", "pendiente")
    .gte("fecha_hora", ahora)
    .order("fecha_hora");

  const propias = jornadas ?? [];

  if (propias.length === 0) {
    return (
      <main className="min-h-dvh bg-fondo pb-10">
        <Cabecera titulo="Disponibilidad" volverA="/" />
        <div className="mx-auto max-w-md p-4">
          <EstadoVacio icono="📅" titulo="No hay jornadas próximas"
            detalle="Cuando se programe la siguiente jornada, podrás marcar aquí tu disponibilidad" />
        </div>
      </main>
    );
  }

  type Jornada = {
    id: string;
    fecha_hora: string;
    rival: string;
    es_local: boolean;
    teams: { nombre: string } | null;
  };

  const idsJornadas = propias.map((j) => j.id);
  const { data: misDisponibilidades } = await supabase
    .from("availability")
    .select("match_id, estado")
    .eq("player_id", profile.player_id)
    .in("match_id", idsJornadas);
  const mapaEstado = new Map((misDisponibilidades ?? []).map((d) => [d.match_id, d.estado as Valor]));

  const grupos = new Map<string, { fechaHora: string; equipos: string[]; matchIds: string[] }>();
  for (const j of propias as unknown as Jornada[]) {
    const clave = fechaMadrid(j.fecha_hora);
    const equipo = j.teams?.nombre ?? "Equipo";
    const grupo = grupos.get(clave) ?? { fechaHora: j.fecha_hora, equipos: [], matchIds: [] };
    if (!grupo.equipos.includes(equipo)) grupo.equipos.push(equipo);
    grupo.matchIds.push(j.id);
    grupos.set(clave, grupo);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Disponibilidad" subtitulo="Marca si puedes jugar cada jornada" volverA="/" />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {[...grupos.entries()].map(([fecha, grupo]) => {
          // El grupo solo cuenta como "respondido" si TODAS sus jornadas
          // (A/B/C del mismo día) tienen fila de disponibilidad y, además,
          // todas comparten el mismo estado. Si falta alguna por responder,
          // o si están respondidas mostrando estados distintos, se trata
          // como sin responder (null) para que el jugador vuelva a
          // confirmar en vez de ver un valor parcial o inconsistente.
          const estados = grupo.matchIds.map((id) => mapaEstado.get(id));
          const todasRespondidas = estados.every((e): e is Valor => e !== undefined);
          const mismoEstado = todasRespondidas && estados.every((e) => e === estados[0]);
          const valorInicial = mismoEstado ? (estados[0] as Valor) : null;
          return (
            <Tarjeta key={fecha} className="flex flex-col gap-2">
              <p className="font-semibold text-tinta">{formatearFechaGrupo(fecha)}</p>
              <p className="text-sm text-tinta-suave">
                Juegan: {grupo.equipos.join(" · ")}
              </p>
              <SelectorDisponibilidad fecha={fecha} valorInicial={valorInicial} />
            </Tarjeta>
          );
        })}
      </div>
    </main>
  );
}
