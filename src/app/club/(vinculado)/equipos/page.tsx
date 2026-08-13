import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor, Rejilla } from "@/components/ui/Contenedor";
import { SelectorTemporada } from "@/components/ui/SelectorTemporada";
import { conTemporada, elegirTemporada, leerTemporadas } from "@/lib/temporadas";
import { nombreDeFila } from "@/lib/club/nombre-socio";

type Jornada = {
  id: string;
  ronda: number;
  fecha_hora: string | null;
  rival: string;
  es_local: boolean;
};

type Capitan = { player_id: string; players: { nombre: string } | null };

/** Tarjeta de acceso a una pantalla de la sección. */
function Acceso({
  href,
  titulo,
  detalle,
}: {
  href: string;
  titulo: string;
  detalle: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Tarjeta
        compacta
        className="flex h-full items-center justify-between gap-3 transition hover:border-borde-acento"
      >
        <div className="min-w-0">
          <p className="font-semibold text-tinta">{titulo}</p>
          <p className="text-sm text-tinta-suave">{detalle}</p>
        </div>
        <span aria-hidden className="shrink-0 text-lg text-tinta-suave">
          →
        </span>
      </Tarjeta>
    </Link>
  );
}

/**
 * Subtítulo de la cabecera a partir del nombre de la temporada.
 *
 * La temporada activa se llama "Interclubs 2026", así que poner el nombre tal cual
 * bajo el título dejaba "Interclubs / Interclubs 2026". Se quita el prefijo cuando
 * lo trae y se queda solo el año.
 */
function subtituloTemporada(nombre: string): string {
  const sinPrefijo = nombre.replace(/^interclubs\s*/i, "").trim();
  return sinPrefijo ? `Temporada ${sinPrefijo}` : nombre;
}

function ChipMargen({ margenElo }: { margenElo: number | null }) {
  const texto = margenElo ? `≥${margenElo} ELO` : "Orden estricto";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
      {texto}
    </span>
  );
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

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ temporada?: string }>;
}) {
  const { temporada: temporadaPedida } = await searchParams;
  const supabase = await createServerSupabase();
  const temporadas = await leerTemporadas(supabase);
  const season = elegirTemporada(temporadas, temporadaPedida);

  if (!season) {
    return (
      <main className="min-h-dvh bg-fondo pb-10">
        <Cabecera titulo="Interclubs" subtitulo="Liga por equipos de la FACV" medida="panel" />
        <Contenedor medida="panel">
          <EstadoVacio
            titulo="Los equipos llegan con el interclubs"
            detalle="Aquí verás calendario, clasificación y convocatorias de los equipos A, B y C"
          />
        </Contenedor>
      </main>
    );
  }

  const { data: equipos } = await supabase
    .from("teams")
    .select("id, nombre, categoria, margen_elo, team_captains(player_id, players(nombre, apodo))")
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
      <Cabecera titulo="Interclubs" subtitulo={subtituloTemporada(season.nombre)} medida="panel" />
      <Contenedor medida="panel" className="space-y-6">
        {temporadas.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SelectorTemporada temporadas={temporadas} actual={season} ruta="/club/equipos" />
            {!season.activa && (
              <p className="text-sm text-tinta-suave">
                Estás viendo una temporada terminada.
              </p>
            )}
          </div>
        )}

        {/* Los dos accesos de la sección, en rejilla. Antes "Mi disponibilidad"
            ocupaba el ancho entero y su flecha acababa a 1600 px del texto, que
            deja de leerse como parte de la tarjeta. */}
        <Rejilla>
          {/* La disponibilidad es sobre jornadas que vienen, así que en una temporada
              terminada no pinta nada. */}
          {season.activa && (
            <Acceso
              href="/club/disponibilidad"
              titulo="Mi disponibilidad"
              detalle="Marca si puedes jugar cada jornada"
            />
          )}
          <Acceso
            href={conTemporada("/club/orden-fuerza", season)}
            titulo="Ranking oficial"
            detalle="ELO de la FACV y orden de fuerza"
          />
        </Rejilla>

        {(equipos ?? []).length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay equipos"
            detalle="El club aún no ha dado de alta ningún equipo para esta temporada"
          />
        ) : (
          // Tres columnas en pantalla ancha: son tres equipos y así caben en una
          // fila en vez de dejar el tercero solo debajo con un hueco al lado.
          <Rejilla columnas={3}>
            {(equipos ?? []).map((eq) => {
              const capitanes = (eq.team_captains ?? []) as unknown as Capitan[];
              const resumen = resumenJornadas(jornadasPorEquipo.get(eq.id) ?? []);
              return (
                <Link
                  key={eq.id}
                  href={conTemporada(`/club/equipos/${eq.id}`, season)}
                  className="h-full"
                >
                  <Tarjeta className="flex h-full flex-col gap-3">
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
                        : `Capitán: ${capitanes.map((c) => nombreDeFila(c.players)).join(", ")}`}
                    </p>

                    {resumen.length > 0 && (
                      <ul className="flex flex-col gap-1.5 border-t border-borde pt-2">
                        {resumen.map((j) => (
                          <li key={j.id} className="flex items-center justify-between text-sm">
                            <span className="text-tinta">
                              R{j.ronda} · {j.es_local ? "vs" : "@"} {j.rival}
                            </span>
                            <span className="text-xs text-tinta-suave">
                              {formatearFechaMadrid(j.fecha_hora, { day: "2-digit", month: "2-digit", year: "numeric" })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Tarjeta>
                </Link>
              );
            })}
          </Rejilla>
        )}
      </Contenedor>
    </main>
  );
}
