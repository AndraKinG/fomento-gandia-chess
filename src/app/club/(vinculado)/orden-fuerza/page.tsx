import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor } from "@/components/ui/Contenedor";
import { Pestana, Pestanas } from "@/components/ui/Pestanas";
import { SelectorTemporada } from "@/components/ui/SelectorTemporada";
import { conTemporada, elegirTemporada, leerTemporadas } from "@/lib/temporadas";
import {
  estadisticasClub,
  etiquetaNumero,
  ordenarPorElo,
} from "@/lib/elo/ranking-oficial";
import { inicioDelTrozo, partirEnDos } from "@/lib/ui/columnas";

type Fila = {
  numero: number;
  bisIndex: number;
  ficha: string;
  nombre: string;
  /** Nullable de verdad: `force_order.elo_oficial` se añadió en la migración 0004
   *  sin `not null`, y un socio recién metido a mano puede no tenerlo. */
  eloOficial: number | null;
  eloFide: number | null;
  eloFeda: number | null;
};

/** Cómo se ordena la lista. Son los dos criterios que pidió el propietario. */
type Criterio = "orden" | "elo";

/**
 * Un trozo de la lista, como tabla.
 *
 * Tabla y no una tarjeta por jugador: son 46 filas de cuatro datos, y una lista de
 * tarjetas obliga a bajar cuatro pantallas para ver algo que cabe de una vez.
 *
 * `desde` es la posición global del primer elemento del trozo: en el orden por ELO
 * la primera columna es el puesto, y con la lista partida en dos el índice local
 * empezaría otra vez por 1 en la segunda mitad.
 */
function TablaRanking({
  filas,
  desde,
  criterio,
  miFicha,
  conFide,
  conFeda,
}: {
  filas: Fila[];
  desde: number;
  criterio: Criterio;
  miFicha: string | null;
  conFide: boolean;
  conFeda: boolean;
}) {
  return (
    <Tarjeta compacta>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-tinta-suave">
              <th scope="col" className="pb-1 pr-2 font-medium">
                {criterio === "elo" ? "#" : "Nº"}
              </th>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Jugador
              </th>
              <th scope="col" className="pb-1 pr-2 text-right font-medium">
                Oficial
              </th>
              {/* Las columnas de FIDE y FEDA solo si alguien tiene ese ELO. Estaban
                  siempre, y con las 46 fichas sin ninguno de los dos eran dos columnas
                  de guiones ocupando ancho. Vuelven solas en cuanto haya un dato. */}
              {conFide && (
                <th scope="col" className="hidden pb-1 pr-2 text-right font-medium sm:table-cell">
                  FIDE
                </th>
              )}
              {conFeda && (
                <th scope="col" className="hidden pb-1 text-right font-medium sm:table-cell">
                  FEDA
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const soyYo = f.ficha === miFicha;
              return (
                <tr
                  key={`${f.numero}-${f.bisIndex}`}
                  className={`border-t border-borde ${soyYo ? "bg-tarjeta-suave" : ""}`}
                >
                  <td className="py-1.5 pr-2 tabular-nums text-tinta-suave">
                    {criterio === "elo"
                      ? desde + i + 1
                      : etiquetaNumero(f.numero, f.bisIndex)}
                  </td>
                  <td className="py-1.5 pr-2 text-tinta">
                    {/* El nombre lleva a la ficha del socio: es donde están su foto,
                        sus aperturas y sus partidas. */}
                    <Link
                      href={`/club/socios/${f.ficha}`}
                      className={`hover:text-acento-texto hover:underline ${soyYo ? "font-semibold" : ""}`}
                    >
                      {f.nombre}
                    </Link>
                    {/* En el orden por ELO se enseña al lado el número de orden: es lo
                        que deja ver de un vistazo dónde los dos criterios no coinciden. */}
                    {criterio === "elo" && (
                      <span className="ml-2 text-xs text-tinta-suave">
                        nº {etiquetaNumero(f.numero, f.bisIndex)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-tinta">
                    {f.eloOficial || "—"}
                  </td>
                  {conFide && (
                    <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                      {f.eloFide ?? "—"}
                    </td>
                  )}
                  {conFeda && (
                    <td className="hidden py-1.5 text-right tabular-nums text-tinta-suave sm:table-cell">
                      {f.eloFeda ?? "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

function Estadistica({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold tabular-nums text-tinta">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{etiqueta}</p>
    </div>
  );
}

/**
 * Ranking de ELO oficial y orden de fuerza del club, abierto a todos los socios.
 *
 * POR QUÉ ESTÁ EN INTERCLUBS y no en su propia sección: el orden de fuerza es una
 * pieza del Interclubs, no un dato suelto. Es lo que decide en qué tablero juega
 * cada uno, porque el RGC de la FACV prohíbe alinear a un jugador por delante de
 * otro más fuerte. Quien lo mira, lo mira para entender su sitio en el equipo.
 *
 * LO MISMO YA EXISTÍA EN `/club/admin/orden-fuerza`, pero solo para el admin y con
 * los botones de importar y sincronizar. Esta es la versión de lectura: el dato
 * interesa a los 46 socios, no solo a quien lo actualiza.
 *
 * DOS ORDENACIONES, que es lo que pidió el propietario:
 *
 * - **Orden de fuerza**: el número oficial de la FACV. Es el que manda en las
 *   convocatorias, y NO siempre coincide con ordenar por ELO — un jugador que entra
 *   a mitad de temporada recibe un número "bis" junto a otro de fuerza parecida en
 *   vez de recolocar la lista entera.
 * - **Por ELO**: de mayor a menor ELO oficial. Al lado de cada uno se deja su
 *   número de orden, que es justo lo que hace ver dónde los dos criterios difieren.
 */
export default async function OrdenFuerzaPage({
  searchParams,
}: {
  searchParams: Promise<{ por?: string; temporada?: string }>;
}) {
  const { por, temporada: temporadaPedida } = await searchParams;
  const criterio: Criterio = por === "elo" ? "elo" : "orden";

  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const temporadas = await leerTemporadas(supabase);
  const season = elegirTemporada(temporadas, temporadaPedida);

  const { data: orden } = season
    ? await supabase
        .from("force_order")
        .select("numero, bis_index, elo_oficial, player_id, players(nombre, elo_fide, elo_feda)")
        .eq("season_id", season.id)
        .order("numero")
        .order("bis_index")
    : { data: null };

  const filas: Fila[] = (orden ?? []).map((f) => {
    const p = f.players as unknown as {
      nombre: string;
      elo_fide: number | null;
      elo_feda: number | null;
    } | null;
    return {
      numero: f.numero,
      bisIndex: f.bis_index,
      ficha: f.player_id,
      nombre: p?.nombre ?? "Socio",
      eloOficial: f.elo_oficial ?? null,
      eloFide: p?.elo_fide ?? null,
      eloFeda: p?.elo_feda ?? null,
    };
  });

  const visibles = criterio === "elo" ? ordenarPorElo(filas) : filas;
  // Ninguna de las 46 fichas tiene ELO FEDA ni FIDE (la FACV publica el suyo y el id
  // FIDE, no el número), así que eran dos columnas de guiones ocupando ancho.
  const conFide = filas.some((f) => f.eloFide !== null);
  const conFeda = filas.some((f) => f.eloFeda !== null);
  const trozos = partirEnDos(visibles);

  // Estadísticas del club: salen de la misma consulta, así que no cuestan nada, y
  // llenan de contenido útil el hueco de arriba en vez de dejar la tabla sola.
  const { media, maximo } = estadisticasClub(filas);
  const miFila = sesion?.playerId
    ? filas.find((f) => f.ficha === sesion.playerId)
    : undefined;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        // "Ranking OFICIAL" y no "del club": ese nombre ya lo lleva el ranking de
        // ELO interno de Torneos → Del club, y dos pantallas con el mismo título
        // es la forma más rápida de que nadie sepa cuál está mirando.
        titulo="Ranking oficial"
        subtitulo="ELO de la FACV y orden de fuerza"
        volverA={conTemporada("/club/equipos", season)}
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {/* Fuera del bloque de "hay filas": una temporada sin orden de fuerza no tiene
            nada que enseñar, y si el selector viviera dentro te quedabas sin poder
            cambiar desde esta pantalla. */}
        {season && temporadas.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SelectorTemporada
              temporadas={temporadas}
              actual={season}
              ruta="/club/orden-fuerza"
              // La ordenación elegida se mantiene al cambiar de temporada.
              extra={criterio === "elo" ? { por: "elo" } : {}}
            />
            {!season.activa && (
              <p className="text-sm text-tinta-suave">
                Estás viendo una temporada terminada.
              </p>
            )}
          </div>
        )}

        {filas.length === 0 ? (
          <EstadoVacio
            icono="📋"
            titulo="Todavía no hay orden de fuerza"
            detalle="La FACV lo publica al empezar la temporada."
          />
        ) : (
          <>
            <Tarjeta>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                <Estadistica valor={String(filas.length)} etiqueta="Jugadores" />
                <Estadistica valor={media?.toString() ?? "—"} etiqueta="ELO medio" />
                <Estadistica valor={maximo?.toString() ?? "—"} etiqueta="Más alto" />
                {miFila && (
                  <Estadistica
                    valor={etiquetaNumero(miFila.numero, miFila.bisIndex)}
                    etiqueta="Tu número"
                  />
                )}
              </div>
              {season && (
                <p className="mt-3 text-xs text-tinta-suave">
                  {season.nombre}. Lo publica la FACV y es el orden que manda en las
                  convocatorias.
                </p>
              )}
            </Tarjeta>

            <Pestanas>
              <Pestana
                href={conTemporada("/club/orden-fuerza", season)}
                activa={criterio === "orden"}
              >
                Orden de fuerza
              </Pestana>
              <Pestana
                href={conTemporada("/club/orden-fuerza?por=elo", season)}
                activa={criterio === "elo"}
              >
                Por ELO
              </Pestana>
            </Pestanas>

            {/* DOS COLUMNAS DESDE `lg`, no una tabla de 46 filas. La lista es alta y
                estrecha: en un monitor ocupaba metro y medio de scroll mientras el
                nombre más largo dejaba media pantalla en blanco a su derecha. Partida
                en dos cabe casi de una vez, y el corte va por la mitad para que las
                dos columnas midan lo mismo. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {trozos.map((trozo, n) => (
                <TablaRanking
                  key={n}
                  filas={trozo}
                  desde={inicioDelTrozo(trozos, n)}
                  criterio={criterio}
                  miFicha={sesion?.playerId ?? null}
                  conFide={conFide}
                  conFeda={conFeda}
                />
              ))}
            </div>

            <Tarjeta compacta>
              <p className="text-xs text-tinta-suave">
                <b className="font-semibold">Oficial</b>: el ELO con el que la FACV hace
                el orden. Si falta, el mayor entre FEDA y FIDE (RGC 52.1).{" "}
                <b className="font-semibold">bis</b>: entró después de publicarse la
                lista.
              </p>
              {/* Aquí decía dónde ver "el ELO propio del club". Fuera desde el
                  2026-08-13, con el ELO interno: era la única frase de la app que
                  mandaba a buscarlo, así que dejarla habría sido enviar al socio a una
                  pantalla que ya no existe. Ver `jugar/torneos/ranking/page.tsx`. */}
            </Tarjeta>
          </>
        )}
      </Contenedor>
    </main>
  );
}
