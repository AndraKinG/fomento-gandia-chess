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
  eloParaOrdenar,
  estadisticasClub,
  etiquetaNumero,
  ordenarPorElo,
} from "@/lib/elo/ranking-oficial";
import { inicioDelTrozo, partirEnDos } from "@/lib/ui/columnas";
import { nombreDeFila } from "@/lib/club/nombre-socio";

type Fila = {
  numero: number;
  bisIndex: number;
  ficha: string;
  /** El mote del club si lo tiene; si no, el oficial (`nombreVisible`). */
  nombre: string;
  /** El de la FACV, siempre. Se enseña debajo del mote cuando son distintos. */
  nombreOficial: string;
  /** Nullable de verdad: `force_order.elo_oficial` se añadió en la migración 0004
   *  sin `not null`, y un socio recién metido a mano puede no tenerlo. */
  eloOficial: number | null;
  eloFide: number | null;
  eloFeda: number | null;
  /** El estimado que pone la junta a mano, para quien no tiene FIDE (`players.elo_otro`). */
  eloOtro: number | null;
  /** false = ya no es del club. Sigue en la lista porque el orden de fuerza es un
   *  documento de la FACV que no se puede reescribir; se marca. */
  activo: boolean;
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
  conEstimado,
}: {
  filas: Fila[];
  desde: number;
  criterio: Criterio;
  miFicha: string | null;
  conFide: boolean;
  conFeda: boolean;
  conEstimado: boolean;
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
              {/* LA COLUMNA QUE MANDA CAMBIA CON LA PESTAÑA, y esto era el fallo del
                  2026-08-13: en "Por ELO" la única cifra que se veía en un móvil era la
                  del orden de fuerza —estática todo el año, y solo para Interclubs—
                  porque la de FIDE estaba escondida hasta los 640 px. Ahora en esa
                  pestaña la primera columna es el ELO REAL (FIDE de clásicas).

                  Y NINGUNA COLUMNA SE LLAMA YA "OFICIAL", que era la queja de un socio
                  de la junta el 2026-08-25: "ELO = FIDE, Oficial = orden de fuerza —
                  siendo el FIDE el oficial, ese campo o se quita o refleja el ELO que
                  pongo yo a mano". Tenía razón en las dos cosas: el rating oficial de
                  un jugador ES el de la FIDE, así que llamar "Oficial" al número de un
                  documento interno invitaba a leerlo al revés. Ahora cada columna dice
                  lo que es —"O. fuerza"— y en la pestaña de ELO su sitio lo ocupa el
                  ESTIMADO, que es el dato que allí falta: el de los socios que aún no
                  tienen FIDE. El orden de fuerza sigue entero en su propia pestaña, que
                  es de donde no se debe mover. */}
              <th scope="col" className="pb-1 pr-2 text-right font-medium">
                {criterio === "elo" ? "ELO" : "O. fuerza"}
              </th>
              {criterio === "elo"
                ? conEstimado && (
                    <th
                      scope="col"
                      className="hidden pb-1 pr-2 text-right font-medium sm:table-cell"
                      title="Lo pone la junta a mano para quien no tiene ELO FIDE"
                    >
                      Estimado
                    </th>
                  )
                : conFide && (
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
              // SIN NINGÚN ELO la fila se apaga entera, y es lo que pidió el
              // propietario: son los últimos ocho de la lista, todos con un guion, y
              // en negro sobre blanco pesaban más que los que sí tienen número. Un
              // socio recién federado sin partidas valoradas no es una fila importante.
              const sinElo = criterio === "elo" && eloParaOrdenar(f) === null;
              return (
                <tr
                  key={`${f.numero}-${f.bisIndex}`}
                  className={`border-t border-borde ${soyYo ? "bg-tarjeta-suave" : ""} ${
                    sinElo ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-1.5 pr-2 tabular-nums text-tinta-suave">
                    {criterio === "elo"
                      ? desde + i + 1
                      : etiquetaNumero(f.numero, f.bisIndex)}
                  </td>
                  <td className="py-1.5 pr-2 text-tinta">
                    {/* El nombre lleva a la ficha del socio: su foto, sus aperturas,
                        sus partidas y —para junta y admin— su mote y su ELO estimado.

                        VA PINTADO COMO ENLACE SIEMPRE, no solo al pasar el ratón: en un
                        móvil no hay ratón, así que era texto plano y nadie sabía que se
                        podía tocar. Un socio de la junta lo pidió como "un enlace en el
                        nombre que me lleve a la ficha" — el enlace ya estaba, lo que
                        faltaba era que se viera. */}
                    {/* EL NÚMERO DE ORDEN VA EN LA MISMA LÍNEA QUE EL NOMBRE, y esto
                        era el problema visual que trajo el propietario: el nombre
                        oficial se pintaba en bloque ANTES del número, así que quien
                        tiene mote ocupaba TRES líneas (mote / nombre oficial / nº) y
                        quien no tiene, una. El resultado era una columna que se estiraba
                        el doble que la de al lado. Ahora son dos líneas como mucho:
                        nombre y número arriba, el oficial debajo. */}
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        href={`/club/socios/${f.ficha}`}
                        className={`text-acento-texto hover:underline ${soyYo ? "font-semibold" : ""}`}
                      >
                        {f.nombre}
                      </Link>
                      {/* En el orden por ELO se enseña al lado el número de orden: es lo
                          que deja ver de un vistazo dónde los dos criterios no
                          coinciden. */}
                      {criterio === "elo" && (
                        <span className="text-xs text-tinta-suave">
                          nº {etiquetaNumero(f.numero, f.bisIndex)}
                        </span>
                      )}
                      {/* LAS BAJAS SE MARCAN, NO SE QUITAN: esta lista es el orden de
                          fuerza que publica la FACV y no se puede reescribir hasta la
                          temporada siguiente. Pero un socio que ya no está y sin marca
                          se lee como uno más. */}
                      {!f.activo && (
                        <span className="rounded-full bg-tarjeta-suave px-1.5 text-[0.65rem] font-semibold uppercase text-tinta-suave ring-1 ring-borde">
                          baja
                        </span>
                      )}
                    </span>
                    {/* EL OFICIAL DEBAJO, y solo si el mote no es él: esta lista es el
                        orden de fuerza que publica la FACV, así que el nombre de la
                        federación tiene que poder leerse — si no, un capitán no sabría
                        con qué nombre buscar a alguien en un acta. */}
                    {f.nombreOficial !== f.nombre && (
                      <span className="block truncate text-xs leading-tight text-tinta-suave">
                        {f.nombreOficial}
                      </span>
                    )}
                  </td>
                  {/* El guion, en gris y sin negrita: es la ausencia de un dato, no un
                      dato. En negrita competía con los ELOs de verdad. */}
                  <td
                    className={`py-1.5 pr-2 text-right tabular-nums ${
                      sinElo ? "text-tinta-suave" : "font-semibold text-tinta"
                    }`}
                  >
                    {(criterio === "elo" ? eloParaOrdenar(f) : f.eloOficial) || "—"}
                  </td>
                  {criterio === "elo"
                    ? conEstimado && (
                        <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                          {/* Solo se enseña si NO tiene FIDE: con FIDE, el estimado ya
                              no se usa para nada y ponerlo al lado invita a compararlos
                              como si fueran dos opiniones sobre lo mismo. */}
                          {f.eloFide === null ? (f.eloOtro ?? "—") : "—"}
                        </td>
                      )
                    : conFide && (
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
        .select("numero, bis_index, elo_oficial, player_id, players(nombre, apodo, elo_fide, elo_feda, elo_otro, activo)")
        .eq("season_id", season.id)
        .order("numero")
        .order("bis_index")
    : { data: null };

  const filas: Fila[] = (orden ?? []).map((f) => {
    const p = f.players as unknown as {
      nombre: string;
      apodo: string | null;
      elo_fide: number | null;
      elo_feda: number | null;
      elo_otro: number | null;
      activo: boolean | null;
    } | null;
    return {
      numero: f.numero,
      bisIndex: f.bis_index,
      ficha: f.player_id,
      nombre: nombreDeFila(p),
      // El OFICIAL aparte: en esta pantalla se enseña debajo del mote, porque el orden
      // de fuerza es un documento de la FACV y ahí el nombre de la federación importa.
      nombreOficial: p?.nombre ?? "Socio",
      eloOficial: f.elo_oficial ?? null,
      eloFide: p?.elo_fide ?? null,
      eloFeda: p?.elo_feda ?? null,
      eloOtro: p?.elo_otro ?? null,
      activo: p?.activo !== false,
    };
  });

  const visibles = criterio === "elo" ? ordenarPorElo(filas) : filas;
  // Ninguna de las 46 fichas tiene ELO FEDA ni FIDE (la FACV publica el suyo y el id
  // FIDE, no el número), así que eran dos columnas de guiones ocupando ancho.
  const conFide = filas.some((f) => f.eloFide !== null);
  const conFeda = filas.some((f) => f.eloFeda !== null);
  // La columna del estimado solo aparece si le sirve a alguien: un socio SIN FIDE que
  // lo tenga puesto. Con todo el club federado sería una columna de guiones.
  const conEstimado = filas.some((f) => f.eloFide === null && f.eloOtro !== null);
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
                  conEstimado={conEstimado}
                />
              ))}
            </div>

            <Tarjeta compacta>
              {/* LA LEYENDA SIGUE A LAS COLUMNAS: decía "Oficial" cuando ya no hay
                  ninguna columna con ese nombre. */}
              <p className="text-xs text-tinta-suave">
                <b className="font-semibold">ELO</b>: el FIDE de clásicas, al día.{" "}
                <b className="font-semibold">O. fuerza</b>: el del documento que la FACV
                publica para el Interclubs, del día que se hizo.{" "}
                <b className="font-semibold">Estimado</b>: lo pone la junta a mano para
                quien todavía no tiene FIDE.{" "}
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
