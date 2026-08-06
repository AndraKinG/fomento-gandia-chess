import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { PARTIDAS_PROVISIONALES } from "@/lib/club/elo";
import { leerRanking } from "../datos";
import { Contenedor } from "@/components/ui/Contenedor";

export default async function RankingPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();
  const ranking = await leerRanking(supabase);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Ranking del club"
        subtitulo="ELO interno, solo con torneos del club"
        volverA="/club/torneos/interno" medida="panel"
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
                  {ranking.map((f, i) => {
                    const diferencia = f.elo - f.eloOficial;
                    const esProvisional = f.partidas < PARTIDAS_PROVISIONALES;
                    return (
                      <tr
                        key={f.ficha}
                        className={`border-t border-borde ${
                          f.ficha === sesion?.playerId ? "bg-tarjeta-suave" : ""
                        }`}
                      >
                        <td className="py-1.5 pr-2 text-tinta-suave">{i + 1}</td>
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

            <Tarjeta compacta>
              <p className="text-xs text-tinta-suave">
                Cada uno arranca con su ELO oficial (FACV, FIDE o FEDA), y la
                columna <b className="font-semibold">Dif.</b> es cuánto ha subido o
                bajado jugando en el club. El número entre paréntesis son las
                partidas jugadas cuando todavía son menos de{" "}
                {PARTIDAS_PROVISIONALES}: hasta ahí el ELO se mueve el doble para
                llegar antes a su nivel real.
              </p>
              <p className="mt-2 text-xs text-tinta-suave">
                Solo cuentan las partidas de torneos internos. Las del repositorio no
                afectan al ranking: cada uno sube las que quiere y no habría forma de
                comprobarlas.
              </p>
            </Tarjeta>
          </>
        )}
      </Contenedor>
    </main>
  );
}
