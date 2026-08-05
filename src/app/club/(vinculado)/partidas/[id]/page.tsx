import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import { textoResultado, type Resultado } from "@/lib/partidas/validar";
import { AccionesPartida } from "./AccionesPartida";
import { VisorPartida } from "@/components/ajedrez/VisorPartida";

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
      "id, player_id, fecha, ronda, rival_nombre, rival_id, rival_elo, mi_elo, color, resultado, apertura, notas, pgn, torneo_texto, tournament_id, players!games_player_id_fkey(nombre), tournaments(nombre)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) redirect("/club/partidas");

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
      />
      <div className="mx-auto max-w-md space-y-4 p-4 sm:max-w-2xl">
        <Tarjeta destacada>
          {/* El emparejamiento se muestra por colores, que es como se lee una
              partida, y no por "dueño y rival": quien la consulta quiere saber
              quién llevaba blancas. */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-tinta">
                <span aria-hidden>♙</span> {blancas}
              </p>
              <p className="mt-1 text-sm text-tinta">
                <span aria-hidden>♟</span> {negras}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-tarjeta px-3 py-1 text-sm font-semibold text-tinta ring-1 ring-borde">
              {textoResultado(resultado)} de {duenio.split(",")[0].split(" ")[0]}
            </span>
          </div>
        </Tarjeta>

        <Tarjeta>
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
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              Anotaciones
            </h2>
            <Tarjeta>
              <p className="whitespace-pre-line text-sm text-tinta">{p.notas}</p>
            </Tarjeta>
          </section>
        )}

        {p.pgn && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              PGN
            </h2>
            <Tarjeta>
              {/* El tablero se orienta desde el punto de vista del dueño de la
                  partida: quien la consulta quiere verla como la vivió él. */}
              <VisorPartida pgn={p.pgn} volteado={p.color === "negras"} />
            </Tarjeta>
            <details className="px-1">
              <summary className="cursor-pointer text-xs text-tinta-suave">
                Ver el PGN en texto (para copiarlo)
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-borde bg-tarjeta p-3 font-mono text-xs text-tinta">
                {p.pgn}
              </pre>
            </details>
          </section>
        )}

        {esMia && (
          <div className="flex flex-wrap gap-2 pt-2">
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
            <Link
              href={`/club/partidas?q=${encodeURIComponent(duenio)}`}
              className="text-acento-texto underline"
            >
              {duenio}
            </Link>
          </p>
        )}
      </div>
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
