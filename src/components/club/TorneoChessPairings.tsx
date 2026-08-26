import Link from "next/link";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { createServerSupabase } from "@/lib/supabase/server";
import { nombreDeFila } from "@/lib/club/nombre-socio";
import { leerTorneoChessPairings } from "@/lib/import/chesspairings-leer";
import { buscarFicha, indicePorNombre } from "@/lib/import/cruzar-nombres";
import { RefrescarCada } from "@/components/club/RefrescarCada";

/**
 * La clasificación y los emparejamientos de un torneo presencial, traídos de la página
 * pública de ChessPairings y pintados AQUÍ.
 *
 * POR QUÉ NO SE MANDA A LA GENTE FUERA: su página está enlazada, pero un socio que abre el
 * torneo del club quiere ver cómo va sin salir de la app — y sobre todo quiere verse a sí
 * mismo. Aquí sus filas salen con **el mote del club** y enlazan a su ficha.
 *
 * SIN CLAVE NI CUENTA: se lee su página pública, así que **el torneo lo puede haber creado
 * cualquiera con su propia cuenta de ChessPairings**. Es lo que pidió el propietario: que
 * organice quien organice, sin pasar por él. Ver `chesspairings-leer.ts`.
 *
 * EL CRUCE CON NUESTRAS FICHAS: primero por **FIDE ID** cuando su tabla de inscritos lo
 * trae —exacto, sin discusión— y si no, por **nombre** con `buscarFicha`, que es el mismo
 * cruce tolerante que resolvió los cuatro nombres mutilados de las actas de chess-results.
 * Hace falta el de nombre porque su columna de FIDE ID viene vacía en los torneos de
 * jugadores sin federar, que en el club son once.
 *
 * SI SU PÁGINA FALLA NO SE ROMPE NADA: se enseña el enlace, que es lo que había antes.
 */

/** "1", "0.5", "0" → lo que se pinta en la mesa, desde las blancas. */
const MARCA: Record<string, string> = { "1": "1–0", "0.5": "½–½", "0": "0–1" };

export async function TorneoChessPairings({ urlPublica }: { urlPublica: string | null }) {
  if (!urlPublica) return null;

  const lectura = await leerTorneoChessPairings(urlPublica);

  if (lectura.error) {
    // SE DICE QUÉ PASA Y QUÉ HACER: un hueco en blanco donde debería estar la
    // clasificación se lee como que la app está rota.
    const texto =
      lectura.error === "no-existe"
        ? "Ese torneo ya no está en ChessPairings: se ha borrado allí, o el enlace ha cambiado."
        : lectura.error === "vacio"
          ? "Ese enlace no lleva a un torneo con datos. Comprueba que el torneo esté como público en ChessPairings."
          : "No se ha podido conectar con ChessPairings.";
    return (
      <Tarjeta compacta>
        <p className="text-sm text-tinta-suave">{texto}</p>
        <p className="mt-1 text-xs text-tinta-suave">
          Las inscripciones de este torneo siguen aquí. Cambia el enlace o borra el torneo
          si ya no va a jugarse.
        </p>
        <p className="mt-1 text-sm">
          <a
            href={urlPublica}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-acento-texto underline"
          >
            Abrir su página ↗
          </a>
        </p>
      </Tarjeta>
    );
  }

  // NUESTROS MOTES. Dos vías de cruce, y las dos hacen falta: el FIDE ID es exacto pero
  // solo lo tienen los federados, y el nombre cubre al resto.
  const supabase = await createServerSupabase();
  const { data: fichas } = await supabase
    .from("players")
    .select("id, nombre, apodo, fide_id")
    .eq("activo", true);
  const porFide = new Map<string, { ficha: string; nombre: string }>();
  for (const f of fichas ?? []) {
    if (f.fide_id) {
      porFide.set(String(f.fide_id), { ficha: f.id as string, nombre: nombreDeFila(f) });
    }
  }
  const porNombre = new Map(
    (fichas ?? []).map((f) => [f.id as string, { ficha: f.id as string, nombre: nombreDeFila(f) }])
  );
  const indice = indicePorNombre(
    (fichas ?? []).map((f) => ({ id: f.id as string, nombre: f.nombre as string }))
  );
  /** Los datos de su tabla de inscritos, indexados por el id que usa su página. */
  const fidePorJugador = new Map(
    lectura.inscritos
      .filter((i) => i.idJugador !== null && i.fideId !== null)
      .map((i) => [i.idJugador as number, i.fideId as string])
  );

  /** El socio del club que hay detrás de uno de sus jugadores, si es uno de los nuestros. */
  const socioDe = (idJugador: number | null, nombreSuyo: string) => {
    const fide = idJugador === null ? undefined : fidePorJugador.get(idJugador);
    if (fide) {
      const porId = porFide.get(fide);
      if (porId) return porId;
    }
    const encontrada = buscarFicha(nombreSuyo, indice);
    return encontrada ? (porNombre.get(encontrada) ?? null) : null;
  };

  const hayDesempates = lectura.clasificacion.some((f) => f.buc1 !== null || f.sb !== null);

  return (
    <div className="space-y-4">
      {/* SE ACTUALIZA SOLO mientras la pestaña esté delante: el servidor recachea cada
          60 s, pero eso no repinta una pantalla ya abierta. */}
      <RefrescarCada segundos={60} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Clasificación
          </h2>
          {lectura.ronda && lectura.rondasTotales && (
            <p className="text-xs text-tinta-suave">
              Ronda {lectura.ronda} de {lectura.rondasTotales}
            </p>
          )}
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
                        con 28 sistemas, y hacer aquí nuestra cuenta sería pedir dos
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
                    const socio = socioDe(f.idJugador, f.nombre);
                    return (
                      <tr key={f.idJugador ?? f.posicion} className="border-t border-borde">
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
                              <span>{f.nombre}</span>
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
                              {f.buc1 ?? "—"}
                            </td>
                            <td className="hidden py-1.5 text-right tabular-nums text-tinta-suave sm:table-cell">
                              {f.sb ?? "—"}
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
                const b = m.blancas ? socioDe(m.blancas.idJugador, m.blancas.nombre) : null;
                const n = m.negras ? socioDe(m.negras.idJugador, m.negras.nombre) : null;
                return (
                  <li key={m.mesa} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-6 shrink-0 text-xs tabular-nums text-tinta-suave">
                      {m.mesa}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-tinta">
                      {b?.nombre ?? m.blancas?.nombre ?? ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-tinta-suave">
                      {m.esBye ? "descansa" : m.resultado ? MARCA[m.resultado] : "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right text-tinta">
                      {m.esBye ? "" : (n?.nombre ?? m.negras?.nombre ?? "")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        </section>
      )}

      <p className="px-1 text-xs text-tinta-suave">
        Datos de ChessPairings, que es donde se lleva el torneo. Se actualizan cada minuto
        mientras tengas esta pantalla delante.{" "}
        <a
          href={urlPublica}
          target="_blank"
          rel="noopener noreferrer"
          className="text-acento-texto underline"
        >
          Su página oficial ↗
        </a>
      </p>
    </div>
  );
}
