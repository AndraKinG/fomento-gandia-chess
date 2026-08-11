import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { PARTIDAS_PROVISIONALES } from "@/lib/club/elo";
import { leerRanking } from "../datos";
import { Contenedor } from "@/components/ui/Contenedor";
import { inicioDelTrozo, partirEnDos } from "@/lib/ui/columnas";

type FilaRanking = Awaited<ReturnType<typeof leerRanking>>[number];

/** Un trozo del ranking, como tabla. `desde` es la posición global del primer
 *  elemento: con la lista partida, el índice local de la segunda columna volvería
 *  a empezar por 1. */
function TablaClub({
  filas,
  desde,
  miFicha,
}: {
  filas: FilaRanking[];
  desde: number;
  miFicha: string | null;
}) {
  return (
    <Tarjeta compacta>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-tinta-suave">
          <th className="pb-1 pr-2 font-medium">#</th>
          <th className="pb-1 pr-2 font-medium">Jugador</th>
          <th className="pb-1 pr-2 text-right font-medium">ELO club</th>
          <th className="pb-1 text-right font-medium">Dif.</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => {
          const diferencia = f.elo - f.eloOficial;
          const esProvisional = f.partidas < PARTIDAS_PROVISIONALES;
          return (
            <tr
              key={f.ficha}
              className={`border-t border-borde ${
                f.ficha === miFicha ? "bg-tarjeta-suave" : ""
              }`}
            >
              <td className="py-1.5 pr-2 text-tinta-suave">{desde + i + 1}</td>
              <td className="py-1.5 pr-2 text-tinta">
                {f.nombre}
                {esProvisional && (
                  <span
                    className="ml-1 text-xs text-tinta-suave"
                    title={`Menos de ${PARTIDAS_PROVISIONALES} partidas: su ELO todavía se mueve mucho`}
                  >
                    ({f.partidas})
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-right font-semibold text-tinta">
                {f.elo}
              </td>
              <td
                className={`py-1.5 text-right ${
                  diferencia > 0
                    ? "text-green-700 dark:text-green-400"
                    : diferencia < 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-tinta-suave"
                }`}
              >
                {diferencia > 0 ? "+" : ""}
                {diferencia}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </Tarjeta>
  );
}

export default async function RankingPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();
  const ranking = await leerRanking(supabase);
  const trozos = partirEnDos(ranking);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Ranking del club"
        subtitulo="ELO interno, solo con torneos del club"
        volverA="/club/jugar/torneos" medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {ranking.length === 0 && (
          <EstadoVacio
            icono="📈"
            titulo="Todavía no hay ranking"
            detalle="El ELO del club sale de las partidas de los torneos internos. En cuanto se juegue el primero, aparecerá aquí."
          />
        )}

        {ranking.length > 0 && (
          <>
            {/* DOS COLUMNAS cuando la lista se hace larga: puede llegar a los 46
                socios, y una tabla de 46 filas gasta scroll mientras deja media
                pantalla en blanco a su derecha. Mismo criterio que el ranking
                oficial. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {trozos.map((trozo, n) => (
                <TablaClub
                  key={n}
                  filas={trozo}
                  desde={inicioDelTrozo(trozos, n)}
                  miFicha={sesion?.playerId ?? null}
                />
              ))}
            </div>

            <Tarjeta compacta>
              <p className="text-xs text-tinta-suave">
                Cada uno arranca con su ELO oficial. <b className="font-semibold">Dif.</b>{" "}
                es lo que ha subido o bajado jugando en el club. El número entre
                paréntesis son las partidas jugadas: con menos de{" "}
                {PARTIDAS_PROVISIONALES} el ELO se mueve el doble.
              </p>
              <p className="mt-2 text-xs text-tinta-suave">
                Solo cuentan las partidas de torneos internos, no las del repositorio.
              </p>
              {/* Los dos rankings se confunden con facilidad, así que cada uno dice
                  dónde está el otro. */}
              <p className="mt-2 text-xs text-tinta-suave">
                El ranking oficial de la FACV está en{" "}
                <Link
                  href="/club/orden-fuerza"
                  className="font-semibold text-acento-texto underline"
                >
                  Interclubs → Ranking oficial
                </Link>
                .
              </p>
            </Tarjeta>
          </>
        )}
      </Contenedor>
    </main>
  );
}
