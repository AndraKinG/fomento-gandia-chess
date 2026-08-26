import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor } from "@/components/ui/Contenedor";
import { SelectorTemporada } from "@/components/ui/SelectorTemporada";
import { conTemporada, elegirTemporada, leerTemporadas } from "@/lib/temporadas";
import { estadisticasClub, etiquetaNumero } from "@/lib/elo/ranking-oficial";
import { inicioDelTrozo, partirEnDos } from "@/lib/ui/columnas";
import { nombreDeFila } from "@/lib/club/nombre-socio";
import { TablaSocios, type FilaSocio } from "@/components/club/TablaSocios";

function Estadistica({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold tabular-nums text-tinta">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{etiqueta}</p>
    </div>
  );
}

/**
 * El orden de fuerza de la temporada: el documento de la FACV, abierto a los socios.
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
 * UNA SOLA ORDENACIÓN, la del documento. Antes había también un "por ELO" aquí, y se
 * fue con la lista de socios (2026-08-26): ordenar por ELO es mirar quién es más fuerte
 * HOY, y eso es `/club/socios`, que además los tiene a todos. Este papel solo sabe
 * ordenar por su propio número, que es lo único que vale en una convocatoria.
 *
 * SE LLAMABA "RANKING OFICIAL" Y ERA UN NOMBRE ENGAÑOSO (queja de un socio de la junta,
 * 2026-08-26: "Elo = Fide, Oficial = Ordre de força"). El rating oficial de un jugador
 * ES el de la FIDE; llamar "oficial" al número de un documento interno invitaba a leerlo
 * del revés. Ahora la pantalla se llama por lo que es.
 */
export default async function OrdenFuerzaPage({
  searchParams,
}: {
  searchParams: Promise<{ temporada?: string }>;
}) {
  const { temporada: temporadaPedida } = await searchParams;

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

  const filas: FilaSocio[] = (orden ?? [])
    .filter((f) => {
      // LAS BAJAS NO LAS VE NADIE (decisión del propietario, 2026-08-26). Antes se
      // marcaban con una chapa; él lo cortó: quien se fue del club no tiene que salir
      // en ninguna lista. La fila del documento sigue en la base y su ficha entera
      // también — solo deja de pintarse.
      const p = f.players as unknown as { activo: boolean | null } | null;
      return p?.activo !== false;
    })
    .map((f) => {
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
    };
  });

  const visibles = filas;
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
        // El nombre del documento, tal cual: es como lo llaman el capitán y la FACV,
        // y no se puede confundir con ninguna otra lista de la app.
        titulo="Orden de fuerza"
        subtitulo="El documento de la FACV que manda en las convocatorias"
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
                {miFila?.numero != null && (
                  <Estadistica
                    valor={etiquetaNumero(miFila.numero, miFila.bisIndex)}
                    etiqueta="Tu número"
                  />
                )}
              </div>
              {/* AL LADO, LA LISTA DE SOCIOS: este documento no lleva a los socios
                  nuevos —la FACV no lo reescribe a mitad de temporada— así que quien
                  busca a alguien tiene que poder salir de aquí. */}
              <p className="mt-3 text-xs">
                <Link href="/club/socios" className="text-acento-texto underline">
                  Ver todos los socios del club y sus fichas →
                </Link>
              </p>
              {season && (
                <p className="mt-1 text-xs text-tinta-suave">
                  {season.nombre}. Lo publica la FACV y es el orden que manda en las
                  convocatorias.
                </p>
              )}
            </Tarjeta>


            {/* DOS COLUMNAS DESDE `lg`, no una tabla de 46 filas. La lista es alta y
                estrecha: en un monitor ocupaba metro y medio de scroll mientras el
                nombre más largo dejaba media pantalla en blanco a su derecha. Partida
                en dos cabe casi de una vez, y el corte va por la mitad para que las
                dos columnas midan lo mismo. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {trozos.map((trozo, n) => (
                <TablaSocios
                  key={n}
                  filas={trozo}
                  desde={inicioDelTrozo(trozos, n)}
                  criterio="orden"
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
