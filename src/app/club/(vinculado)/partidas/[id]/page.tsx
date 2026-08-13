import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import { textoResultado, type Resultado } from "@/lib/partidas/validar";
import { marcadorDesdeBlancas } from "@/lib/partidas/buscar";
import { AccionesPartida } from "./AccionesPartida";
import { Estrella } from "../Estrella";
import { VisorPartida } from "@/components/ajedrez/VisorPartida";
import { Contenedor } from "@/components/ui/Contenedor";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

export default async function PartidaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const { data: p } = await supabase
    .from("games")
    .select(
      "id, player_id, fecha, ronda, rival_nombre, rival_id, rival_elo, mi_elo, color, resultado, apertura, notas, pgn, torneo_texto, tournament_id, privada, players!games_player_id_fkey(nombre), tournaments(nombre)"
    )
    .eq("id", id)
    .maybeSingle();
  // Una partida privada de otro socio no es que dé error: es que la RLS (0039) no la
  // devuelve, así que aquí llega igual que una que no existe.
  if (!p) redirect("/club/partidas");

  const { data: favorita } = await supabase
    .from("game_favorites")
    .select("game_id")
    .eq("game_id", id)
    .maybeSingle();

  const resultado = p.resultado as Resultado;
  const duenio = (p.players as unknown as { nombre: string } | null)?.nombre ?? "Socio";
  const torneo =
    (p.tournaments as unknown as { nombre: string } | null)?.nombre ?? p.torneo_texto;
  const esMia = p.player_id === sesion?.playerId;

  const blancas = p.color === "blancas" ? duenio : p.rival_nombre;
  const negras = p.color === "blancas" ? p.rival_nombre : duenio;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={`${duenio} vs ${p.rival_nombre}`}
        subtitulo={formatearRangoFechas(p.fecha, p.fecha)}
        volverA="/club/partidas"
        medida="panel"
      />
      {/* EL TABLERO PRIMERO, y no la ficha de datos. Es lo que se viene a ver de
          una partida; el torneo, la ronda y los ELO son contexto. En escritorio
          va a la izquierda con los datos al lado, para que ninguno de los dos
          quede debajo del pliegue; en móvil, arriba, y el resto detrás. */}
      <Contenedor medida="panel">
        {/* La columna del tablero va acotada: `aspect-square` con todo el ancho de
            un panel daría un tablero de 670 px que no cabe de una vez en pantalla. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,32rem)_1fr]">
          <div className="space-y-3">
            {p.pgn ? (
              <>
                <Tarjeta>
                  {/* El tablero se orienta desde el punto de vista del dueño de la
                      partida: quien la consulta quiere verla como la vivió él. */}
                  <VisorPartida pgn={p.pgn} volteado={p.color === "negras"} sala={`repaso-${p.id}`} />
                </Tarjeta>
                <details className="px-1">
                  <summary className="cursor-pointer text-xs text-tinta-suave">
                    Ver el PGN en texto
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-borde bg-tarjeta p-3 font-mono text-xs text-tinta">
                    {p.pgn}
                  </pre>
                </details>
              </>
            ) : (
              <Tarjeta>
                <EstadoVacio
                  icono="♜"
                  titulo="Sin jugadas"
                  detalle={
                    esMia
                      ? "Puedes añadirlas editando la partida."
                      : "Se subió solo con los datos."
                  }
                />
              </Tarjeta>
            )}
          </div>

          <div className="space-y-3">
            <Tarjeta destacada>
              {/* El emparejamiento se muestra por colores, que es como se lee una
                  partida, y no por "dueño y rival": quien la consulta quiere saber
                  quién llevaba blancas. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-tinta">
                    <span aria-hidden>♙</span> {blancas}
                  </p>
                  <p className="mt-1 text-sm text-tinta">
                    <span aria-hidden>♟</span> {negras}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* EL MARCADOR, NO "DERROTA DE JUAN" (lo pidió un socio el
                      2026-08-13, y tenía razón). En la base el resultado se guarda
                      desde el punto de vista del dueño de la partida, y contarlo así
                      —"Derrota de Juan"— obliga a saber quién es el dueño para
                      entender quién ganó. Una partida se lee por su marcador, y las
                      dos líneas de al lado ya dicen quién llevaba cada color.
                      `marcadorDesdeBlancas` hace la vuelta, y tiene tests. */}
                  <span
                    className="rounded-full bg-tarjeta px-3 py-1 text-sm font-semibold tabular-nums text-tinta ring-1 ring-borde"
                    title={`${textoResultado(resultado)} de ${duenio}`}
                  >
                    {marcadorDesdeBlancas(resultado, p.color as "blancas" | "negras")}
                  </span>
                  {/* La estrella al lado del marcador: es lo primero que se mira de la
                      partida y guardarla es una decisión que se toma justo ahí. */}
                  <Estrella gameId={p.id} favorita={Boolean(favorita)} tamano="grande" />
                </div>
              </div>
              {p.privada && (
                <p className="mt-2 text-xs text-tinta-suave">
                  🔒 Solo para ti: esta partida no sale en las del club.
                </p>
              )}
            </Tarjeta>

            <Tarjeta compacta>
              <dl className="space-y-1.5 text-sm">
                <Dato etiqueta="Torneo" valor={torneo} />
                <Dato etiqueta="Ronda" valor={p.ronda ? String(p.ronda) : null} />
                <Dato etiqueta="Apertura" valor={p.apertura} />
                <Dato
                  etiqueta={`ELO de ${duenio.split(",")[0].split(" ")[0]}`}
                  valor={p.mi_elo ? String(p.mi_elo) : null}
                />
                <Dato
                  etiqueta="ELO del rival"
                  valor={p.rival_elo ? String(p.rival_elo) : null}
                />
              </dl>
            </Tarjeta>

            {p.notas && (
              <Tarjeta compacta>
                <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
                  Anotaciones
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm text-tinta">
                  {p.notas}
                </p>
              </Tarjeta>
            )}

            {esMia && (
              <div className="flex flex-wrap gap-2">
                <Boton
                  variante="secundario"
                  href={`/club/partidas/${p.id}/editar`}
                  className="flex-1 text-sm"
                >
                  Editar
                </Boton>
                <AccionesPartida id={p.id} />
              </div>
            )}

            {!esMia && (
              <p className="px-1 text-xs text-tinta-suave">
                Subida por{" "}
                {/* A la FICHA del socio, no a una búsqueda con su nombre: la ficha
                    ya enlaza a sus partidas y además enseña quién es. */}
                <Link
                  href={`/club/socios/${p.player_id}`}
                  className="text-acento-texto underline"
                >
                  {duenio}
                </Link>
              </p>
            )}

            {/* VUELTA AL REPOSITORIO, explícita (lo pidió un socio el 2026-08-13).
                Hasta ahora solo estaba la flecha de la cabecera, que en un móvil no
                se lee como "aquí hay una lista entera de partidas" — y menos si has
                llegado desde un torneo o desde la ficha de alguien, porque entonces la
                flecha no te lleva al repositorio sino de vuelta a donde estabas. */}
            <p className="px-1 pt-1 text-sm">
              <Link href="/club/partidas" className="text-acento-texto underline">
                Ver todas las partidas del club
              </Link>
            </p>
          </div>
        </div>
      </Contenedor>
    </main>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-tinta-suave">{etiqueta}</dt>
      <dd className="text-tinta">{valor}</dd>
    </div>
  );
}
