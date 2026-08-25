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
import { Estrella } from "./Estrella";
import { Contenedor, REJILLA } from "@/components/ui/Contenedor";
import { Pestana, Pestanas } from "@/components/ui/Pestanas";
import { filtroBusqueda, filtroSocioPorNombreOMote } from "@/lib/partidas/buscar";
import { nombreDeFila } from "@/lib/club/nombre-socio";

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
  searchParams: Promise<{ mias?: string; favoritas?: string; q?: string }>;
}) {
  const { mias, favoritas, q } = await searchParams;
  const soloFavoritas = favoritas === "1";
  // "Favoritas" manda sobre "Mías": son dos formas de recortar la misma lista y
  // combinarlas daría una pestaña que no existe en la barra.
  const soloMias = !soloFavoritas && mias === "1";
  const busqueda = (q ?? "").trim();

  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  // Las favoritas de quien mira: hacen falta SIEMPRE, no solo en su pestaña, porque
  // cada tarjeta pinta su estrella encendida o apagada. Es una tabla por cuenta con
  // pocas filas (migración 0039).
  const { data: misFavoritas } = await supabase
    .from("game_favorites")
    .select("game_id")
    .order("created_at", { ascending: false });
  const idsFavoritas = (misFavoritas ?? []).map((f) => f.game_id as string);
  const esFavorita = new Set(idsFavoritas);

  let consulta = supabase
    .from("games")
    .select(
      "id, player_id, fecha, ronda, rival_nombre, rival_elo, mi_elo, color, resultado, apertura, torneo_texto, pgn, privada, players!games_player_id_fkey(nombre, apodo), tournaments(nombre)"
    )
    .order("fecha", { ascending: false })
    .limit(200);

  if (soloMias && sesion?.playerId) consulta = consulta.eq("player_id", sesion.playerId);
  // El UUID de relleno es para el caso "ninguna favorita": un `in.()` vacío rompe el
  // análisis de PostgREST, y aquí lo que se quiere es una lista vacía, no un error.
  if (soloFavoritas) {
    consulta = consulta.in(
      "id",
      idsFavoritas.length > 0 ? idsFavoritas : ["00000000-0000-0000-0000-000000000000"]
    );
  }

  // Búsqueda por nombre: vale tanto el del rival como el del socio dueño de la
  // partida, que es como la gente busca ("las de Pedro" y "las que jugó alguien
  // contra Pedro" son la misma pregunta desde fuera).
  //
  // Los socios se resuelven ANTES, en su propia consulta, y aquí se filtra por
  // `player_id`. Filtrar por `players.nombre` dentro del `or` hacía fallar la consulta
  // entera —PostgREST no admite columnas de una tabla incrustada en el árbol lógico— y
  // el resultado era que buscar un nombre dejaba el repositorio EN BLANCO.
  //
  // Y se busca por el nombre oficial Y POR EL MOTE, que es lo que la lista pinta.
  if (busqueda) {
    const { data: socios } = await supabase
      .from("players")
      .select("id")
      .or(filtroSocioPorNombreOMote(busqueda));
    consulta = consulta.or(
      filtroBusqueda(busqueda, (socios ?? []).map((s) => s.id as string))
    );
  }

  const { data: partidas, error } = await consulta;

  const titulo = soloFavoritas
    ? "Mis favoritas"
    : soloMias
      ? "Mis partidas"
      : "Partidas del club";

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={titulo}
        subtitulo={
          soloFavoritas
            ? "Las que has guardado con la estrella"
            : soloMias
              ? undefined
              : "Todas las que ha subido el club"
        }
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {/* Pestañas y acciones en la MISMA fila desde `sm`. Apiladas eran cuatro
            bloques a todo lo ancho —uno de ellos un degradado de 970 px— antes de
            llegar a la primera partida. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Pestanas>
            <Pestana href="/club/partidas" activa={!soloMias && !soloFavoritas}>
              Todas
            </Pestana>
            <Pestana href="/club/partidas?mias=1" activa={soloMias}>
              Mías
            </Pestana>
            <Pestana href="/club/partidas?favoritas=1" activa={soloFavoritas}>
              ★ Favoritas
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

        <Buscador valor={busqueda} soloMias={soloMias} soloFavoritas={soloFavoritas} />

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
                : soloFavoritas
                  ? "Todavía no has guardado ninguna"
                  : soloMias
                    ? "Todavía no has subido ninguna"
                    : "Todavía no hay partidas"
            }
            detalle={
              busqueda
                ? undefined
                : soloFavoritas
                  ? "Pulsa la estrella de una partida y la tendrás aquí a mano."
                  : "Sube las tuyas con sus datos y quedarán en la base del club para que todos puedan consultarlas."
            }
          />
        )}

        <ul className={REJILLA[2]}>
          {(partidas ?? []).map((p) => {
            const resultado = p.resultado as Resultado;
            const duenio =
              nombreDeFila(p.players);
            const torneo =
              (p.tournaments as unknown as { nombre: string } | null)?.nombre ??
              p.torneo_texto;
            return (
              // TODAS LAS TARJETAS DE UNA FILA, IGUAL DE ALTAS. La rejilla ya estira
              // el `li` hasta la altura de la fila, pero el `Link` y la tarjeta de
              // dentro se quedaban con la altura de SU contenido, así que una partida
              // con enlace al PGN salía más alta que la de al lado y las dos columnas
              // no cuadraban. `h-full` en los tres eslabones es lo que hace que la
              // altura del `li` llegue hasta el borde de la tarjeta.
              <li key={p.id} className="h-full">
                <Link href={`/club/partidas/${p.id}`} className="block h-full">
                  <Tarjeta
                    compacta
                    className="flex h-full flex-col gap-1 transition hover:border-borde-acento"
                  >
                    {/* TRES FILAS SIEMPRE, Y ESO ES LO QUE IGUALA LAS ALTURAS. Antes la
                        derecha era una columna de hasta cuatro iconos apilados
                        (estrella, resultado, color, PGN) y la izquierda de dos a cuatro
                        líneas, así que cada tarjeta medía lo que le tocaba: la que tenía
                        PGN salía más alta que la de al lado, y la que no tenía apertura
                        más baja que todas. `h-full` solo arreglaba las de una MISMA fila.

                        Ahora el pie existe siempre —color, resultado, apertura, candado
                        y PGN en una línea— así que todas las tarjetas tienen el mismo
                        número de líneas, y con `mt-auto` el pie queda pegado abajo
                        aunque el nombre ocupe dos líneas. */}
                    <div className="flex items-start justify-between gap-2">
                      {/* El ELO del rival FUERA del texto que se recorta: metido
                          dentro, en un móvil se cortaba a mitad —"Sanz Wawer, Daniel
                          (208…"— y un ELO a medias es peor que ninguno. Ahora se
                          recortan los nombres y la cifra se ve siempre. */}
                      <p className="flex min-w-0 items-baseline gap-1 text-sm text-tinta">
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
                      <span className="shrink-0">
                        <Estrella gameId={p.id} favorita={esFavorita.has(p.id)} />
                      </span>
                    </div>

                    {/* `truncate`: un torneo de nombre largo partía la línea en dos y
                        volvía a descuadrar la tarjeta. */}
                    <p className="truncate text-xs text-tinta-suave">
                      {formatearRangoFechas(p.fecha, p.fecha)}
                      {p.ronda ? ` · Ronda ${p.ronda}` : ""}
                      {torneo ? ` · ${torneo}` : ""}
                    </p>

                    <div className="mt-auto flex items-center gap-2 text-xs">
                      <span aria-hidden className="shrink-0 text-tinta-suave">
                        {p.color === "blancas" ? "♙" : "♟"}
                      </span>
                      <span
                        className={`shrink-0 text-base font-bold leading-none ${COLOR_MARCA[resultado]}`}
                        title={textoResultado(resultado)}
                      >
                        {MARCA[resultado]}
                      </span>
                      {/* La apertura se lleva el hueco que sobra y se recorta: es el
                          dato menos importante de la tarjeta y el que más varía de
                          largo. */}
                      <span className="min-w-0 flex-1 truncate text-tinta-suave">
                        {p.apertura ?? ""}
                      </span>
                      {/* Solo aparece en las tuyas: si la ves y es privada, es que es
                          tuya (lo garantiza la RLS de la 0039). Sin esta marca no
                          habría forma de saber cuáles has escondido. */}
                      {p.privada && (
                        <span className="shrink-0 text-tinta-suave" title="Solo para ti">
                          🔒
                        </span>
                      )}
                      {p.pgn && (
                        <span className="shrink-0 text-acento-texto" title="Tiene PGN">
                          PGN
                        </span>
                      )}
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
