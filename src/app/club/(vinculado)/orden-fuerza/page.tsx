import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor } from "@/components/ui/Contenedor";
import { Pestana, Pestanas } from "@/components/ui/Pestanas";
import {
  estadisticasClub,
  etiquetaNumero,
  ordenarPorElo,
} from "@/lib/elo/ranking-oficial";

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
  searchParams: Promise<{ por?: string }>;
}) {
  const { por } = await searchParams;
  const criterio: Criterio = por === "elo" ? "elo" : "orden";

  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, nombre")
    .eq("activa", true)
    .maybeSingle();

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
        volverA="/club/equipos"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {filas.length === 0 ? (
          <EstadoVacio
            icono="📋"
            titulo="Todavía no hay orden de fuerza"
            detalle="Se importa de la web de la FACV al empezar la temporada. En cuanto esté, aquí aparece el ranking del club."
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
                  Temporada {season.nombre}. El orden lo publica la FACV y es el que
                  manda en las convocatorias: nadie puede jugar en un tablero por
                  delante de otro con mejor número.
                </p>
              )}
            </Tarjeta>

            <Pestanas>
              <Pestana href="/club/orden-fuerza" activa={criterio === "orden"}>
                Orden de fuerza
              </Pestana>
              <Pestana href="/club/orden-fuerza?por=elo" activa={criterio === "elo"}>
                Por ELO
              </Pestana>
            </Pestanas>

            <Tarjeta compacta>
              {/* Tabla y no una tarjeta por jugador: son 46 filas y en un monitor
                  una lista de tarjetas obliga a desplazarse cuatro pantallas para
                  ver algo que cabe de una vez. Las columnas de FIDE y FEDA se
                  esconden en móvil, donde no caben cuatro números por fila. */}
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
                      <th scope="col" className="hidden pb-1 pr-2 text-right font-medium sm:table-cell">
                        FIDE
                      </th>
                      <th scope="col" className="hidden pb-1 text-right font-medium sm:table-cell">
                        FEDA
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((f, i) => {
                      const soyYo = f.ficha === sesion?.playerId;
                      return (
                        <tr
                          key={`${f.numero}-${f.bisIndex}`}
                          className={`border-t border-borde ${soyYo ? "bg-tarjeta-suave" : ""}`}
                        >
                          <td className="py-1.5 pr-2 tabular-nums text-tinta-suave">
                            {criterio === "elo" ? i + 1 : etiquetaNumero(f.numero, f.bisIndex)}
                          </td>
                          <td className="py-1.5 pr-2 text-tinta">
                            <span className={soyYo ? "font-semibold" : ""}>{f.nombre}</span>
                            {/* En el orden por ELO se enseña al lado el número de
                                orden: es lo que deja ver de un vistazo dónde los dos
                                criterios no coinciden. */}
                            {criterio === "elo" && (
                              <span className="ml-2 text-xs text-tinta-suave">
                                nº {etiquetaNumero(f.numero, f.bisIndex)}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-tinta">
                            {f.eloOficial || "—"}
                          </td>
                          <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                            {f.eloFide ?? "—"}
                          </td>
                          <td className="hidden py-1.5 text-right tabular-nums text-tinta-suave sm:table-cell">
                            {f.eloFeda ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <Tarjeta compacta>
              <p className="text-xs text-tinta-suave">
                <b className="font-semibold">Oficial</b> es el ELO que usa la FACV para
                el orden de fuerza. Cuando falta, el reglamento manda usar el mayor
                entre FEDA y FIDE (art. 52.1). Un número con{" "}
                <b className="font-semibold">bis</b> es de alguien que entró después de
                publicarse la lista: se coloca junto a otro de fuerza parecida en vez de
                recolocar toda la lista.
              </p>
              <p className="mt-2 text-xs text-tinta-suave">
                Este ranking es el oficial. El del{" "}
                <b className="font-semibold">ELO propio del club</b>, que sale solo de
                los torneos internos, está en Torneos → Del club.
              </p>
            </Tarjeta>
          </>
        )}
      </Contenedor>
    </main>
  );
}
