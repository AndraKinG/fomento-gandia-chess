import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { nombreDePila, sesionActual } from "@/lib/auth/sesion";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { calcularMarcador, marcadorPreferido } from "@/lib/marcador";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { TarjetaJornada } from "@/components/ui/TarjetaJornada";
import { Boton } from "@/components/ui/Boton";
import { formatearRangoFechas, hoyISO } from "@/lib/torneos/fechas";
import { Contenedor } from "@/components/ui/Contenedor";

type Estado = "disponible" | "no_disponible" | "duda";
const ICONOS: Record<Estado, string> = { disponible: "✅", no_disponible: "❌", duda: "🤔" };
const TEXTOS: Record<Estado, string> = {
  disponible: "Puedes jugar", no_disponible: "No puedes jugar", duda: "En duda",
};
const DIEZ_DIAS_MS = 10 * 24 * 60 * 60 * 1000;

const ETIQUETA_ESTADO_INTERNO: Record<string, string> = {
  inscripcion: "Inscripción abierta",
  en_curso: "En juego",
  terminado: "Terminado",
};

function formatearFecha(fechaHoraISO: string | null): string {
  if (!fechaHoraISO || Number.isNaN(new Date(fechaHoraISO).getTime())) return "Sin fecha";
  const dia = formatearFechaMadrid(fechaHoraISO, { weekday: "short", day: "2-digit", month: "short" });
  const hora = formatearFechaMadrid(fechaHoraISO, { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

type Resultado = { resultado: number | string };
type TableroConResultado = { id: string; board_results: Resultado | Resultado[] | null };

/** Un embed de PostgREST es un objeto si la relación es 1:1 y una lista si es
 *  1:N. Esto deja las dos formas en lista para poder recorrerlas igual. */
function comoLista<T>(valor: T | T[] | null | undefined): T[] {
  if (valor == null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function formatearDia(fechaISO: string | null): string {
  if (!fechaISO || Number.isNaN(new Date(fechaISO).getTime())) return "—";
  return formatearFechaMadrid(fechaISO, { day: "2-digit", month: "short" });
}

/**
 * Título de sección de la home. Un `h2` de verdad, no un párrafo en mayúsculas:
 * es lo que deja saltar de bloque en bloque con un lector de pantalla.
 *
 * El "Ver todo" va PEGADO al título y no empujado al borde derecho. Con el ancho
 * de escritorio, `justify-between` lo mandaba a 700 px del título y dejaba de
 * leerse como parte de él.
 */
function Titulo({ children, enlace }: { children: React.ReactNode; enlace?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
        {children}
      </h2>
      {enlace && (
        <Link
          href={enlace}
          className="shrink-0 text-xs text-acento-texto hover:underline"
        >
          Ver todo →
        </Link>
      )}
    </div>
  );
}

/**
 * Inicio de la zona de socios: el resumen de lo que pasa en el club.
 *
 * QUÉ CUENTA Y POR QUÉ: la idea del propietario es que aquí se vea de un vistazo
 * "las cosas que pasan" sin entrar en cada sección — la próxima jornada de
 * Interclubs y si has contestado, el último resultado, el torneo del club que
 * esté vivo, a qué torneos de fuera va gente y las últimas partidas subidas. Cada
 * bloque desaparece si no tiene nada que contar, así que en temporada muerta la
 * pantalla se queda corta en vez de llenarse de huecos vacíos.
 *
 * QUÉ NO CUENTA: el ranking de ELO del club. Calcularlo obliga a recorrer todas
 * las partidas de todos los torneos internos (`leerRanking`), y eso son cuatro
 * consultas más en la pantalla más visitada de la app. Está a un toque, en Torneos
 * → Del club.
 *
 * LAS CONSULTAS VAN EN DOS TANDAS, no en fila. Esta pantalla necesitaba diez
 * viajes a Supabase uno detrás de otro, y no pintaba nada hasta el último. Ahora
 * la espera de cada tanda es la de su consulta más lenta y no la suma de todas.
 * La primera tanda es lo que solo depende de quién eres; la segunda, lo que
 * necesita un id que sale de la primera.
 */
export default async function Home() {
  const supabase = await createServerSupabase();
  // `sesionActual()` está memoizada por petición y el layout ya la ha llamado, así
  // que esto no cuesta ningún viaje: sale gratis el usuario, el email y la ficha,
  // que antes eran dos consultas propias de esta pantalla.
  const sesion = await sesionActual();
  const playerId = sesion?.playerId ?? null;
  const nombre = nombreDePila(sesion?.nombre ?? null);

  const ahora = new Date();
  const ahoraISO = ahora.toISOString();
  const dentroVentanaISO = new Date(ahora.getTime() + DIEZ_DIAS_MS).toISOString();
  const hoy = hoyISO();

  const [
    { data: pendientes },
    { data: proximas },
    { data: jugadas },
    { data: torneosProximos },
    { data: jornadasVentana },
    { data: internos },
    { data: ultimasPartidas },
  ] = await Promise.all([
    // Solo si no hay ficha: al vinculado ya no le sirve de nada saber si tiene
    // una solicitud pendiente, y era una consulta para todo el club cada vez que
    // alguien abría la app.
    playerId
      ? Promise.resolve({ data: [] as { id: string }[] })
      : supabase
          .from("link_requests")
          .select("id")
          .eq("user_id", sesion!.userId)
          .eq("status", "pendiente")
          .limit(1),
    supabase
      .from("matches")
      .select("id, ronda, fecha_hora, rival, es_local, sede, teams(nombre)")
      .eq("estado", "pendiente")
      .gte("fecha_hora", ahoraISO)
      .order("fecha_hora")
      .limit(1),
    // La última jornada jugada, para el marcador. Es lo primero que pregunta
    // cualquiera el lunes siguiente y no estaba en ningún sitio de la home.
    supabase
      .from("matches")
      .select("id, ronda, fecha_hora, rival, es_local, marcador_propio, marcador_rival, teams(nombre)")
      .eq("estado", "jugado")
      .order("fecha_hora", { ascending: false })
      .limit(1),
    // Próximos torneos a los que va el club. El Interclubs duerme de abril a
    // enero, así que fuera de esa ventana esto es lo único que la app tiene que
    // contar: sin ello, la home queda vacía media temporada.
    supabase
      .from("tournaments")
      .select("id, nombre, fecha_inicio, fecha_fin, lugar")
      .eq("de_interes", true)
      .gte("fecha_fin", hoy)
      .order("fecha_inicio")
      .limit(3),
    playerId
      ? supabase
          .from("matches")
          .select("id")
          .eq("estado", "pendiente")
          .gte("fecha_hora", ahoraISO)
          .lt("fecha_hora", dentroVentanaISO)
      : Promise.resolve({ data: [] as { id: string }[] }),
    // Torneos internos vivos. Los terminados no se cuelan aquí: para eso está la
    // sección. Se piden tres y se elige en código el que se enseña, porque
    // el criterio es "en juego antes que abierto a inscripción" y ordenar por la
    // columna `estado` solo lo cumpliría por casualidad alfabética.
    supabase
      .from("club_tournaments")
      .select("id, nombre, sistema, estado, rondas_totales, fecha_inicio")
      .in("estado", ["en_curso", "inscripcion"])
      .order("created_at", { ascending: false })
      .limit(3),
    // Últimas partidas del repositorio compartido, para que se vea que está vivo.
    supabase
      .from("games")
      .select("id, fecha, rival_nombre, resultado, color, players(nombre)")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const pendiente = (pendientes ?? []).length > 0;
  const proxima = (proximas ?? [])[0] as unknown as {
    id: string; ronda: number; fecha_hora: string; rival: string; es_local: boolean;
    sede: string | null; teams: { nombre: string } | null;
  } | undefined;
  const jugada = (jugadas ?? [])[0] as unknown as {
    id: string; ronda: number; fecha_hora: string | null; rival: string; es_local: boolean;
    marcador_propio: number | null; marcador_rival: number | null;
    teams: { nombre: string } | null;
  } | undefined;

  const idsTorneos = (torneosProximos ?? []).map((t) => t.id);
  const idsVentana = (jornadasVentana ?? []).map((j) => j.id);
  const internoVivo =
    (internos ?? []).find((t) => t.estado === "en_curso") ?? (internos ?? [])[0];

  const [
    { data: misAsistencias },
    miDisponibilidad,
    { data: misDisponibilidades },
    { data: convocatoria },
    { data: miInscripcion },
    { data: rondasInterno },
  ] = await Promise.all([
    playerId && idsTorneos.length > 0
      ? supabase
          .from("tournament_attendance")
          .select("tournament_id, estado")
          .eq("player_id", playerId)
          .in("tournament_id", idsTorneos)
      : Promise.resolve({ data: [] as { tournament_id: string; estado: string }[] }),
    playerId && proxima
      ? supabase
          .from("availability")
          .select("estado")
          .eq("match_id", proxima.id)
          .eq("player_id", playerId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    playerId && idsVentana.length > 0
      ? supabase
          .from("availability")
          .select("match_id, estado")
          .eq("player_id", playerId)
          .in("match_id", idsVentana)
      : Promise.resolve({ data: [] as { match_id: string; estado: string }[] }),
    // Los resultados por tablero de la jornada jugada, anidados en una sola
    // consulta. Hacen falta porque `marcador_propio`/`marcador_rival` los rellena
    // solo la sync de la FACV: si el capitán anotó tablero a tablero, esas
    // columnas están vacías y sin esto la tarjeta diría "jugado" sin marcador.
    jugada
      ? supabase
          .from("lineups")
          .select("match_id, lineup_boards(id, board_results(resultado))")
          .eq("estado", "publicada")
          .eq("match_id", jugada.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    playerId && internoVivo
      ? supabase
          .from("club_tournament_players")
          .select("player_id")
          .eq("tournament_id", internoVivo.id)
          .eq("player_id", playerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    internoVivo
      ? supabase
          .from("club_rounds")
          .select("numero")
          .eq("tournament_id", internoVivo.id)
          .order("numero", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as { numero: number }[] }),
  ]);

  const asistenciaPorTorneo = new Map(
    (misAsistencias ?? []).map((a) => [a.tournament_id, a.estado as string])
  );
  const miEstado = (miDisponibilidad?.estado as Estado | undefined) ?? null;
  const respondidas = new Set((misDisponibilidades ?? []).map((d) => d.match_id));
  const faltaDisponibilidad = idsVentana.some((id) => !respondidas.has(id));

  // Marcador de la jornada jugada, con la precedencia compartida de la app: los
  // tableros del capitán primero, la sync de la FACV solo como respaldo.
  //
  // `board_results` llega como OBJETO, no como lista: su clave ajena es también
  // su clave primaria, así que PostgREST lo trata como relación 1:1. Se normaliza
  // en vez de dar por hecha una de las dos formas, porque si algún día deja de ser
  // 1:1 el marcador se quedaría en blanco sin que nada fallara.
  const tableros = comoLista(
    convocatoria?.lineup_boards as unknown as TableroConResultado | TableroConResultado[] | null
  );
  const resultadosTablero = tableros
    .flatMap((t) => comoLista(t.board_results))
    .map((r) => Number(r.resultado))
    .filter((n) => !Number.isNaN(n));
  const marcador = jugada
    ? marcadorPreferido({
        boardsMarcador:
          tableros.length > 0
            ? calcularMarcador(resultadosTablero, tableros.length)
            : null,
        marcadorPropio: jugada.marcador_propio,
        marcadorRival: jugada.marcador_rival,
      })
    : null;

  const rondaActual = (rondasInterno ?? [])[0]?.numero ?? 0;
  const estoyInscrito = Boolean(miInscripcion);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      {/* Saludo por el nombre de pila, no por el correo: el club ya está escrito
          en la barra lateral y en el escudo, y un correo como saludo queda frío.
          Si todavía no hay ficha vinculada no hay nombre, y entonces el título
          vuelve a ser el del club. */}
      <Cabecera
        titulo={nombre ? `Hola, ${nombre}` : "Fomento de Gandia"}
        subtitulo="Esto es lo que pasa en el club"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {!playerId && !pendiente && (
          <Banner tipo="aviso">
            Aún no estás vinculado a tu ficha del club →{" "}
            <Link href="/club/vincular" className="font-semibold underline">
              hazlo aquí
            </Link>
          </Banner>
        )}
        {!playerId && pendiente && (
          <Banner tipo="ok">Solicitud de vinculación pendiente de aprobación.</Banner>
        )}
        {faltaDisponibilidad && (
          <Banner tipo="aviso">
            <p className="mb-2">Tienes jornadas próximas sin responder tu disponibilidad.</p>
            <Boton variante="secundario" href="/club/disponibilidad" className="text-sm">
              Marcar disponibilidad
            </Boton>
          </Banner>
        )}

        {/* Dos columnas IGUALES en escritorio. Con 2/1 la derecha se quedaba con
            una tarjeta suelta y un hueco enorme debajo, porque fuera de temporada
            no hay torneo interno ni partidas nuevas que contar. A mitades el peso
            se reparte y el hueco no se acumula en un solo lado. En móvil se apilan
            en este mismo orden. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <section className="space-y-2">
              <Titulo enlace="/club/equipos">Interclubs</Titulo>
              {proxima ? (
                <Link href={`/club/jornadas/${proxima.id}`} className="block">
                  <TarjetaJornada
                    equipo={proxima.teams?.nombre ?? "Equipo"}
                    rival={proxima.rival}
                    fechaTexto={formatearFecha(proxima.fecha_hora)}
                    esLocal={proxima.es_local}
                    sede={proxima.sede ?? undefined}
                    extra={
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
                          Ronda {proxima.ronda}
                        </span>
                        {playerId && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento">
                            {miEstado ? `${ICONOS[miEstado]} ${TEXTOS[miEstado]}` : "Sin responder aún"}
                          </span>
                        )}
                      </>
                    }
                  />
                </Link>
              ) : (
                // Dentro de una tarjeta: suelto se quedaba flotando en medio de la
                // columna, sin nada que dijera dónde empieza y acaba el bloque.
                <Tarjeta>
                  <EstadoVacio
                    icono="♟"
                    titulo="Aún no hay jornadas"
                    detalle="Cuando arranque el interclubs verás aquí tu próxima jornada"
                  />
                </Tarjeta>
              )}

              {jugada && (
                <Link href={`/club/jornadas/${jugada.id}`} className="block">
                  <Tarjeta className="flex items-center justify-between gap-3 transition hover:border-borde-acento">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-tinta-suave">
                        Último resultado · {jugada.teams?.nombre ?? "Equipo"}
                      </p>
                      <p className="truncate font-semibold text-tinta">
                        {jugada.es_local ? "vs" : "@"} {jugada.rival}
                      </p>
                      <p className="text-sm text-tinta-suave">
                        Ronda {jugada.ronda} · {formatearDia(jugada.fecha_hora)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-bold tabular-nums text-tinta">
                        {marcador ? marcador.texto : "—"}
                      </p>
                      {marcador?.parcial && (
                        <p className="text-xs text-tinta-suave">Parcial</p>
                      )}
                    </div>
                  </Tarjeta>
                </Link>
              )}
            </section>

            {(torneosProximos ?? []).length > 0 && (
              <section className="space-y-2">
                <Titulo enlace="/club/torneos/facv">Próximos torneos</Titulo>
                <ul className="space-y-2">
                  {(torneosProximos ?? []).map((t) => {
                    const estado = asistenciaPorTorneo.get(t.id);
                    return (
                      <li key={t.id}>
                        <Link href={`/club/torneos/facv/${t.id}`} className="block">
                          <Tarjeta
                            compacta
                            className="flex items-center justify-between gap-3 transition hover:border-borde-acento"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-tinta">{t.nombre}</p>
                              <p className="text-sm text-tinta-suave">
                                {formatearRangoFechas(t.fecha_inicio, t.fecha_fin)}
                                {t.lugar ? ` · ${t.lugar}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-tinta-suave">
                              {estado === "voy"
                                ? "✅ Vas"
                                : estado === "no_voy"
                                  ? "❌ No vas"
                                  : estado === "duda"
                                    ? "🤔 Duda"
                                    : "¿Vas?"}
                            </span>
                          </Tarjeta>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <section className="space-y-2">
              <Titulo enlace="/club/torneos/interno">Torneos del club</Titulo>
              {internoVivo ? (
                <Link href={`/club/torneos/interno/${internoVivo.id}`} className="block">
                  <Tarjeta
                    destacada={internoVivo.estado === "en_curso"}
                    className="transition hover:border-borde-acento"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide text-acento-texto">
                      {ETIQUETA_ESTADO_INTERNO[internoVivo.estado]}
                    </p>
                    <p className="mt-1 font-semibold text-tinta">{internoVivo.nombre}</p>
                    <p className="text-sm text-tinta-suave">
                      {internoVivo.sistema === "liguilla" ? "Liguilla" : "Suizo"}
                      {internoVivo.estado === "en_curso" && rondaActual > 0
                        ? ` · Ronda ${rondaActual}${
                            internoVivo.rondas_totales ? ` de ${internoVivo.rondas_totales}` : ""
                          }`
                        : ""}
                    </p>
                    {playerId && (
                      <p className="mt-2 text-sm font-medium text-acento-texto">
                        {estoyInscrito
                          ? "✅ Estás dentro"
                          : internoVivo.estado === "inscripcion"
                            ? "Apúntate →"
                            : "No juegas este"}
                      </p>
                    )}
                  </Tarjeta>
                </Link>
              ) : (
                <Tarjeta compacta>
                  <p className="text-sm text-tinta-suave">
                    Ahora mismo no hay ningún torneo del club en marcha.
                  </p>
                  <Link
                    href="/club/torneos/interno/ranking"
                    className="mt-2 inline-block text-sm text-acento-texto underline"
                  >
                    Ver el ranking de ELO del club
                  </Link>
                </Tarjeta>
              )}
            </section>

            {(ultimasPartidas ?? []).length > 0 && (
              <section className="space-y-2">
                <Titulo enlace="/club/partidas">Últimas partidas</Titulo>
                <ul className="space-y-2">
                  {(ultimasPartidas ?? []).map((p) => {
                    const duenio =
                      (p.players as unknown as { nombre: string } | null)?.nombre ?? "Socio";
                    return (
                      <li key={p.id}>
                        <Link href={`/club/partidas/${p.id}`} className="block">
                          <Tarjeta
                            compacta
                            className="flex items-center justify-between gap-2 transition hover:border-borde-acento"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-tinta">
                                <span className="font-semibold">{duenio}</span>
                                <span className="text-tinta-suave"> vs </span>
                                {p.rival_nombre}
                              </p>
                              <p className="text-xs text-tinta-suave">
                                {formatearDia(p.fecha)} · {p.color === "blancas" ? "♔" : "♚"}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">
                              {p.resultado === "1" ? "1" : p.resultado === "0" ? "0" : "½"}
                            </span>
                          </Tarjeta>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </Contenedor>
    </main>
  );
}
