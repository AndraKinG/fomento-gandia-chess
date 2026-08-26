import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Contenedor } from "@/components/ui/Contenedor";
import { PuntoConectado } from "@/components/presencia/Presencia";
import { textoResultado, type Resultado } from "@/lib/partidas/validar";
import { nombreVisible } from "@/lib/club/nombre-socio";
import { EditorMote } from "@/components/club/EditorMote";
import { EditorEloEstimado } from "@/components/club/EditorEloEstimado";
import { ElosFide, elosDeFila } from "@/components/club/ElosFide";
import { BajaSocio } from "@/components/club/BajaSocio";

/**
 * La ficha pública de un socio: lo que los demás ven de él.
 *
 * EXISTE PARA TODAS LAS FICHAS, tenga cuenta o no: el ELO, el número de orden y
 * las partidas subidas son del SOCIO, no de su cuenta. La foto y las aperturas
 * solo aparecen si él las ha puesto desde su perfil.
 *
 * Y ES LA PANTALLA DONDE LA JUNTA GESTIONA A UN SOCIO (2026-08-16, pedido por un socio
 * de la junta: "el apodo no el puc posar a ningú, soles tinc accés a la meua fitxa").
 * El mote y el ELO estimado se ponían solo en `/club/admin/orden-fuerza`, y esa puerta
 * es SOLO DEL ADMIN: las acciones aceptaban a la junta desde el primer día, pero la
 * junta no podía llegar a la pantalla que las llama. Aquí sí, porque esta ficha ya la
 * ve todo el club — y es además donde uno mira cuando quiere saber de alguien.
 *
 * LA FOTO VA CON URL FIRMADA de una hora, generada aquí con la clave de
 * servicio: el bucket es privado (migración 0030) y así la cara de un socio no
 * es una URL pública adivinable — quien no tiene sesión no llega ni a esta
 * página, que vive en el grupo `(vinculado)`.
 */
export default async function SocioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const { data: socio } = await supabase
    .from("players")
    .select(
      "id, nombre, apodo, apodo_solicitado, foto_url, aperturas, elo_fide, elo_feda, elo_otro, fide_id, elo_fide_rapidas, elo_fide_blitz, variacion_fide, variacion_fide_rapidas, variacion_fide_blitz, elo_fide_leido_en, activo"
    )
    .eq("id", id)
    .maybeSingle();
  if (!socio) redirect("/club");

  const { data: temporada } = await supabase
    .from("seasons")
    .select("id")
    .eq("activa", true)
    .maybeSingle();

  const [{ data: orden }, { data: partidas }, { count: cuantasPartidas }] = await Promise.all([
    temporada
      ? supabase
          .from("force_order")
          .select("numero, bis_index, elo_oficial")
          .eq("season_id", temporada.id)
          .eq("player_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("games")
      .select("id, fecha, rival_nombre, color, resultado")
      .eq("player_id", id)
      .order("fecha", { ascending: false })
      .limit(5),
    supabase.from("games").select("id", { count: "exact", head: true }).eq("player_id", id),
  ]);

  // La URL firmada solo si hay foto: firmar una ruta que no existe da igualmente
  // una URL, que luego falla al cargar con un roto feo.
  let fotoFirmada: string | null = null;
  if (socio.foto_url) {
    const { data } = await createAdminClient()
      .storage.from("fotos")
      .createSignedUrl(socio.foto_url, 3600);
    fotoFirmada = data?.signedUrl ?? null;
  }

  const esMiFicha = sesion?.playerId === socio.id;
  // Quien puede gestionar a un socio: junta y admin, los mismos que las acciones.
  const puedeGestionar = Boolean(sesion?.esJunta || sesion?.esAdmin);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      {/* EL MOTE EN EL TÍTULO y el nombre oficial de subtítulo: la ficha es la pantalla
          donde tiene que estar el nombre con el que la FACV publica a cada uno, porque
          es donde se viene a saber quién es alguien. */}
      <Cabecera
        titulo={nombreVisible(socio)}
        subtitulo={socio.apodo ? socio.nombre : "Socio del club"}
        volverAtras
        medida="lectura"
      />
      <Contenedor medida="lectura" className="space-y-4">
        <Tarjeta destacada className="flex items-center gap-4">
          {fotoFirmada ? (
            // La URL firmada caduca en una hora: el optimizador de <Image />
            // la cachearía ya muerta, así que va un <img> normal a propósito.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoFirmada}
              alt={`Foto de ${nombreVisible(socio)}`}
              className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-borde-acento"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-tarjeta-suave text-3xl font-bold text-acento-texto ring-2 ring-borde"
            >
              {nombreVisible(socio).trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
              <span className="min-w-0 truncate">{nombreVisible(socio)}</span>
              <PuntoConectado ficha={socio.id} />
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
              {/* El ELO REAL: `elo_fide` (clásicas al día, lo trae la sync del
                  ranking FACV). Si no tiene, el del orden de fuerza, diciéndolo.
                  Regla de los tres ELOs en CLAUDE.md. */}
              {/* Y de último recurso el ESTIMADO (`elo_otro`), que antes no se
                  enseñaba en ninguna parte: es el del socio que acaba de entrar y
                  todavía no sale federado, o sea justo el que nadie sabe. Sin
                  enseñarlo, ponerlo no servía para nada. */}
              {(socio.elo_fide || orden?.elo_oficial || socio.elo_otro) && (
                <span
                  title={
                    socio.elo_fide
                      ? "FIDE de clásicas, al día (se actualiza cada semana)"
                      : orden?.elo_oficial
                        ? "Del orden de fuerza: aún no tiene ELO de clásicas"
                        : "Estimado por el club: todavía no tiene ELO FIDE"
                  }
                  className="rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-semibold text-tinta ring-1 ring-borde"
                >
                  ELO {socio.elo_fide ?? orden?.elo_oficial ?? socio.elo_otro}
                  {!socio.elo_fide && !orden?.elo_oficial && (
                    <span className="font-normal text-tinta-suave"> estimado</span>
                  )}
                </span>
              )}
              {/* QUE ESTÁ DE BAJA LO VE TODO EL CLUB, no solo la junta: si alguien
                  busca a un socio para retarlo y no le sale el botón, la explicación
                  tiene que estar en su ficha y no ser un misterio. */}
              {socio.activo === false && (
                <span className="rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-semibold text-tinta-suave ring-1 ring-borde">
                  Ya no está en el club
                </span>
              )}
              {orden && (
                <span className="rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
                  Nº {orden.numero}
                  {orden.bis_index ? "bis" : ""} del club
                </span>
              )}
              {/* EL ID FIDE, ENLAZADO, TAMBIÉN AQUÍ (2026-08-13): estaba solo en el
                  perfil propio, así que servía para verte tú y no para ver a los
                  demás — que es justo para lo que se pidió. Esta es la pantalla donde
                  se viene a saber quién es alguien.

                  Lo abre el navegador del socio, así que el bloqueo de fide.com a las
                  IP de centro de datos no le afecta (ver CLAUDE.md). */}
              {socio.fide_id && (
                <a
                  href={`https://ratings.fide.com/profile/${socio.fide_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ficha en la FIDE"
                  className="rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde"
                >
                  FIDE {socio.fide_id} ↗
                </a>
              )}
            </div>
            {socio.aperturas && (
              <p className="mt-2 text-sm text-tinta">
                <span aria-hidden>♟</span>{" "}
                <span className="text-tinta-suave">Juega:</span> {socio.aperturas}
              </p>
            )}
          </div>
        </Tarjeta>

        {/* LOS TRES ELOS DE LA FIDE con su variación pendiente. Va aquí, justo debajo
            de quién es: es la pregunta por la que se entra en una ficha. El chip de
            arriba sigue diciendo el ELO que MANDA (clásicas, o el del orden de fuerza
            si no tiene); esto lo desglosa. */}
        <ElosFide elos={elosDeFila(socio)} />

        {esMiFicha && (
          <p className="px-1 text-xs text-tinta-suave">
            Así te ven los demás.{" "}
            <Link href="/club/perfil" className="text-acento-texto underline">
              Cambiar foto o aperturas
            </Link>
          </p>
        )}

        {/* GESTIÓN, SOLO JUNTA Y ADMIN. Va aquí y no en una pantalla aparte porque es
            donde la junta llega de verdad: desde la lista de ELO, tocando un nombre. Y
            el aviso de "un socio pide su mote" también trae aquí. */}
        {puedeGestionar && (
          <Tarjeta className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-tinta">Gestión del socio</p>
              <p className="text-xs text-tinta-suave">Solo lo ve la junta y el admin.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
                  Mote del club
                </p>
                <EditorMote
                  playerId={socio.id}
                  apodo={socio.apodo}
                  apodoSolicitado={socio.apodo_solicitado}
                  nombreOficial={socio.nombre}
                  ancho="ficha"
                />
                <p className="text-xs text-tinta-suave">
                  Se ve en todo el club. El nombre oficial de la FACV no cambia.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
                  ELO estimado
                </p>
                <EditorEloEstimado
                  playerId={socio.id}
                  eloOtro={socio.elo_otro}
                  nombreOficial={socio.nombre}
                />
                {/* DECIR LO QUE ESTE CAMPO NO HACE, porque es la trampa evidente: quien
                    ve "ELO" aquí espera corregir el número grande de arriba, y ese lo
                    reescribe la sincronización del fin de semana desde la FACV. */}
                <p className="text-xs text-tinta-suave">
                  {socio.elo_fide
                    ? "Tiene ELO FIDE, así que manda aquel. Este no se usa."
                    : "Para quien aún no tiene ELO FIDE. Se usa en las convocatorias."}
                </p>
              </div>
            </div>
            {/* DAR DE BAJA VA AL FINAL Y SEPARADO: es lo único de esta tarjeta que
                cambia lo que el socio puede hacer, no solo cómo se le llama. */}
            <div className="border-t border-borde pt-3">
              <BajaSocio
                playerId={socio.id}
                nombre={nombreVisible(socio)}
                activo={socio.activo !== false}
              />
            </div>
          </Tarjeta>
        )}

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Sus últimas partidas
          </h2>
          {(partidas ?? []).length === 0 ? (
            <Tarjeta compacta>
              <p className="text-sm text-tinta-suave">Todavía no ha subido ninguna.</p>
            </Tarjeta>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
              <ul className="divide-y divide-borde">
                {(partidas ?? []).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/club/partidas/${p.id}`}
                      className="flex items-center gap-2 px-3 py-2 transition hover:bg-tarjeta-suave"
                    >
                      <span aria-hidden className="shrink-0 text-tinta-suave">
                        {p.color === "blancas" ? "♙" : "♟"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                        vs {p.rival_nombre}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-tinta">
                        {textoResultado(p.resultado as Resultado)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(cuantasPartidas ?? 0) > 5 && (
            <p className="px-1 text-right text-xs">
              <Link
                href={`/club/partidas?q=${encodeURIComponent(socio.nombre)}`}
                className="text-acento-texto underline"
              >
                Ver las {cuantasPartidas} en el repositorio →
              </Link>
            </p>
          )}
        </section>
      </Contenedor>
    </main>
  );
}
