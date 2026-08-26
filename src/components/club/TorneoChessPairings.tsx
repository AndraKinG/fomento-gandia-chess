import Link from "next/link";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { createServerSupabase } from "@/lib/supabase/server";
import { nombreDeFila } from "@/lib/club/nombre-socio";
import { leerTorneoChessPairings } from "@/lib/import/chesspairings-leer";
import { idDesdeEnlace } from "@/lib/import/chesspairings";

/**
 * La clasificación y los emparejamientos de un torneo presencial, traídos de
 * ChessPairings y pintados AQUÍ.
 *
 * POR QUÉ NO SE MANDA A LA GENTE FUERA: su página pública existe y está enlazada, pero
 * un socio que abre el torneo del club quiere ver cómo va sin salir de la app — y sobre
 * todo quiere verse a sí mismo. Aquí sus filas salen con **el mote del club** en vez de
 * "Sanfélix Domínguez, Juan Vicente", y la propia se marca.
 *
 * EL CRUCE VA POR FIDE ID Y NO POR NOMBRE, que es lo que lo hace fiable: su
 * `/iscritti` trae el `fide_id` de cada inscrito y 35 de nuestros 46 socios lo tienen.
 * Con los nombres habría que pelearse otra vez con "Apellidos, Nombre" contra "Nombre
 * Apellidos" y con los acentos, que es lo que costó cuatro socios en las actas de
 * chess-results.
 *
 * SI SU API FALLA NO SE ROMPE NADA: se enseña el enlace a su página, que es lo que había
 * antes de esto.
 */

/** "1", "0.5", "0" → lo que se pinta en la mesa, desde las blancas. */
const MARCA: Record<string, string> = { "1": "1–0", "0.5": "½–½", "0": "0–1" };

export async function TorneoChessPairings({ urlPublica }: { urlPublica: string | null }) {
  const id = idDesdeEnlace(urlPublica);
  if (id === null) return null;

  const lectura = await leerTorneoChessPairings(id);

  if (lectura.error || !lectura.torneo) {
    // SE DICE QUÉ PASA Y NO SE CALLA: un hueco en blanco donde debería estar la
    // clasificación se lee como que la app está rota.
    const texto =
      lectura.error === "sin-clave"
        ? "Falta la clave de ChessPairings para traer la clasificación."
        : lectura.error === "no-autorizado"
          ? "La clave de ChessPairings no vale o se ha revocado."
          : lectura.error === "no-existe"
            ? "Ese torneo no está en la cuenta de ChessPairings del club."
            : lectura.error === "limite"
              ? "ChessPairings está limitando las peticiones. Prueba en un minuto."
              : "No se ha podido conectar con ChessPairings.";
    return (
      <Tarjeta compacta>
        <p className="text-sm text-tinta-suave">{texto}</p>
        {urlPublica && (
          <p className="mt-1 text-sm">
            <a
              href={urlPublica}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-acento-texto underline"
            >
              Ver la clasificación en su página ↗
            </a>
          </p>
        )}
      </Tarjeta>
    );
  }

  // NUESTROS MOTES: se traen las fichas con FIDE ID y se cruzan por ese número.
  const supabase = await createServerSupabase();
  const { data: fichas } = await supabase
    .from("players")
    .select("id, nombre, apodo, fide_id")
    .not("fide_id", "is", null);
  const porFide = new Map(
    (fichas ?? []).map((f) => [
      String(f.fide_id),
      { ficha: f.id as string, nombre: nombreDeFila(f) },
    ])
  );
  /** El socio del club que hay detrás de una inscripción, si es uno de los nuestros. */
  const socioDe = (inscripcionId: number | null) => {
    if (inscripcionId === null) return null;
    const fide = lectura.fidePorInscripcion.get(inscripcionId);
    return fide === undefined ? null : (porFide.get(String(fide)) ?? null);
  };

  const t = lectura.torneo;
  const hayDesempates = lectura.clasificacion.some((f) => f.desempates.buc1 !== null);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Clasificación
          </h2>
          <p className="text-xs text-tinta-suave">
            {t.rondaActual && t.rondasTotales
              ? `Ronda ${t.rondaActual} de ${t.rondasTotales}`
              : null}
            {t.motor === "bbp6" ? " · emparejado con bbpPairings (FIDE)" : ""}
          </p>
        </div>
        {lectura.clasificacion.length === 0 ? (
          <Tarjeta compacta>
            <p className="text-sm text-tinta-suave">
              Todavía no hay clasificación: la habrá en cuanto se juegue la primera ronda.
            </p>
          </Tarjeta>
        ) : (
          <Tarjeta compacta>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tinta-suave">
                    <th className="pb-1 pr-2 font-medium">#</th>
                    <th className="pb-1 pr-2 font-medium">Jugador</th>
                    <th className="pb-1 pr-2 text-right font-medium">Pts</th>
                    {/* LOS DESEMPATES SON LOS SUYOS y no se recalculan: los saca su motor
                        con 28 sistemas, y hacer aquí nuestra propia cuenta sería pedir dos
                        opiniones sobre lo mismo. */}
                    {hayDesempates && (
                      <>
                        <th
                          className="hidden pb-1 pr-2 text-right font-medium sm:table-cell"
                          title="Buchholz cortado"
                        >
                          Buc1
                        </th>
                        <th
                          className="hidden pb-1 text-right font-medium sm:table-cell"
                          title="Sonneborn-Berger"
                        >
                          SB
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lectura.clasificacion.map((f) => {
                    const socio = socioDe(f.inscripcionId);
                    return (
                      <tr key={f.inscripcionId ?? f.posicion} className="border-t border-borde">
                        <td className="py-1.5 pr-2 tabular-nums text-tinta-suave">
                          {f.posicion}
                        </td>
                        <td className="py-1.5 pr-2 text-tinta">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            {socio ? (
                              <Link
                                href={`/club/socios/${socio.ficha}`}
                                className="font-semibold text-acento-texto hover:underline"
                              >
                                {socio.nombre}
                              </Link>
                            ) : (
                              <span>
                                {f.titulo ? (
                                  <span className="mr-1 text-xs font-bold text-tinta-suave">
                                    {f.titulo}
                                  </span>
                                ) : null}
                                {f.nombre} {f.apellidos}
                              </span>
                            )}
                            {f.rating ? (
                              <span className="text-xs tabular-nums text-tinta-suave">
                                {f.rating}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-tinta">
                          {f.puntos}
                        </td>
                        {hayDesempates && (
                          <>
                            <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                              {f.desempates.buc1 ?? "—"}
                            </td>
                            <td className="hidden py-1.5 text-right tabular-nums text-tinta-suave sm:table-cell">
                              {f.desempates.sb ?? "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}
      </section>

      {lectura.emparejamientos.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            {lectura.ronda ? `Ronda ${lectura.ronda}` : "Emparejamientos"}
          </h2>
          <Tarjeta compacta>
            <ul className="divide-y divide-borde">
              {lectura.emparejamientos.map((m) => {
                const b = socioDe(m.blancas?.inscripcionId ?? null);
                const n = socioDe(m.negras?.inscripcionId ?? null);
                return (
                  <li key={m.mesa} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-6 shrink-0 tabular-nums text-xs text-tinta-suave">
                      {m.mesa}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-tinta">
                      {b?.nombre ?? `${m.blancas?.nombre ?? ""} ${m.blancas?.apellidos ?? ""}`.trim()}
                    </span>
                    <span className="shrink-0 tabular-nums text-tinta-suave">
                      {m.esBye
                        ? "descansa"
                        : m.resultado
                          ? MARCA[m.resultado]
                          : "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right text-tinta">
                      {m.esBye
                        ? ""
                        : (n?.nombre ?? `${m.negras?.nombre ?? ""} ${m.negras?.apellidos ?? ""}`.trim())}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        </section>
      )}

      <p className="px-1 text-xs text-tinta-suave">
        Datos de ChessPairings, que es donde se lleva el torneo. Se actualizan solos cada
        minuto.{" "}
        {t.enlacePublico && (
          <a
            href={t.enlacePublico}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acento-texto underline"
          >
            Su página oficial ↗
          </a>
        )}
      </p>
    </div>
  );
}
