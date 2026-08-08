import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import { textoResultado, type Resultado } from "@/lib/partidas/validar";
import { Buscador } from "./Buscador";
import { Exportar } from "./Exportar";
import { Contenedor, REJILLA } from "@/components/ui/Contenedor";
import { Pestana, Pestanas } from "@/components/ui/Pestanas";

// "½" y no "=": es como se escriben las tablas en el resto de la app (el acta, el
// marcador de una jornada y la clasificación de los torneos internos).
const MARCA: Record<Resultado, string> = { "1": "✓", "0.5": "½", "0": "✗" };
const COLOR_MARCA: Record<Resultado, string> = {
  "1": "text-green-700 dark:text-green-400",
  "0.5": "text-tinta-suave",
  "0": "text-red-700 dark:text-red-400",
};

export default async function PartidasPage({
  searchParams,
}: {
  searchParams: Promise<{ mias?: string; q?: string }>;
}) {
  const { mias, q } = await searchParams;
  const soloMias = mias === "1";
  const busqueda = (q ?? "").trim();

  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  let consulta = supabase
    .from("games")
    .select(
      "id, player_id, fecha, ronda, rival_nombre, rival_elo, mi_elo, color, resultado, apertura, torneo_texto, pgn, players!games_player_id_fkey(nombre), tournaments(nombre)"
    )
    .order("fecha", { ascending: false })
    .limit(200);

  if (soloMias && sesion?.playerId) consulta = consulta.eq("player_id", sesion.playerId);

  // Búsqueda por nombre: vale tanto el del rival como el del socio dueño de la
  // partida, que es como la gente busca ("las de Pedro" y "las que jugó alguien
  // contra Pedro" son la misma pregunta desde fuera).
  if (busqueda) {
    const patron = `%${busqueda}%`;
    consulta = consulta.or(
      `rival_nombre.ilike.${patron},players.nombre.ilike.${patron}`
    );
  }

  const { data: partidas, error } = await consulta;

  const titulo = soloMias ? "Mis partidas" : "Partidas del club";

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={titulo}
        subtitulo={soloMias ? undefined : "Todas las que ha subido el club"} medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {/* Pestañas y acciones en la MISMA fila desde `sm`. Apiladas eran cuatro
            bloques a todo lo ancho —uno de ellos un degradado de 970 px— antes de
            llegar a la primera partida. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Pestanas>
            <Pestana href="/club/partidas" activa={!soloMias}>
              Todas
            </Pestana>
            <Pestana href="/club/partidas?mias=1" activa={soloMias}>
              Mías
            </Pestana>
          </Pestanas>
          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="solido" href="/club/partidas/nueva" className="text-sm">
              Subir partida
            </Boton>
            <Boton variante="secundario" href="/club/partidas/importar" className="text-sm">
              Importar
            </Boton>
            <Exportar />
          </div>
        </div>

        <Buscador valor={busqueda} soloMias={soloMias} />

        {error && (
          <Tarjeta compacta>
            <p className="text-sm text-tinta-suave">
              No se pudieron cargar las partidas. Prueba a quitar el filtro.
            </p>
          </Tarjeta>
        )}

        {!error && (partidas ?? []).length === 0 && (
          <EstadoVacio
            icono="♜"
            titulo={
              busqueda
                ? "Ninguna partida con ese nombre"
                : soloMias
                  ? "Todavía no has subido ninguna"
                  : "Todavía no hay partidas"
            }
            detalle={
              busqueda
                ? undefined
                : "Sube las tuyas con sus datos y quedarán en la base del club para que todos puedan consultarlas."
            }
          />
        )}

        <ul className={REJILLA[2]}>
          {(partidas ?? []).map((p) => {
            const resultado = p.resultado as Resultado;
            const duenio =
              (p.players as unknown as { nombre: string } | null)?.nombre ?? "Socio";
            const torneo =
              (p.tournaments as unknown as { nombre: string } | null)?.nombre ??
              p.torneo_texto;
            return (
              <li key={p.id}>
                <Link href={`/club/partidas/${p.id}`} className="block">
                  <Tarjeta
                    compacta
                    className="transition hover:border-borde-acento"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* El ELO del rival FUERA del texto que se recorta: metido
                            dentro, en un móvil se cortaba a mitad —"Sanz Wawer, Daniel
                            (208…"— y un ELO a medias es peor que ninguno. Ahora se
                            recortan los nombres y la cifra se ve siempre. */}
                        <p className="flex items-baseline gap-1 text-sm text-tinta">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{duenio}</span>
                            <span className="text-tinta-suave"> vs </span>
                            <span className="font-semibold">{p.rival_nombre}</span>
                          </span>
                          {p.rival_elo ? (
                            <span className="shrink-0 tabular-nums text-tinta-suave">
                              ({p.rival_elo})
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-tinta-suave">
                          {formatearRangoFechas(p.fecha, p.fecha)}
                          {p.ronda ? ` · Ronda ${p.ronda}` : ""}
                          {torneo ? ` · ${torneo}` : ""}
                        </p>
                        {p.apertura && (
                          <p className="truncate text-xs text-tinta-suave">{p.apertura}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span
                          className={`text-lg font-bold ${COLOR_MARCA[resultado]}`}
                          title={textoResultado(resultado)}
                        >
                          {MARCA[resultado]}
                        </span>
                        <span aria-hidden className="text-xs text-tinta-suave">
                          {p.color === "blancas" ? "♙" : "♟"}
                        </span>
                        {p.pgn && (
                          <span className="text-xs text-acento-texto" title="Tiene PGN">
                            PGN
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
      </Contenedor>
    </main>
  );
}
