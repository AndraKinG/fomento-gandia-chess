import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { ActivarNotificaciones } from "@/components/PushSubscriber";
import { InstalarApp } from "@/components/InstalarApp";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipElo } from "@/components/ui/ChipElo";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
// Con alias y no relativo: este import cruza de la zona de socios a la de
// autenticación, y un "../" de más se rompe en cuanto se mueve una carpeta —
// que es justo lo que pasó al bajar la app a /club.
import { logout } from "@/app/(auth)/actions";
import { Contenedor } from "@/components/ui/Contenedor";
import { BotonAccion } from "@/components/ui/BotonAccion";
import { PreferenciasAvisos } from "./PreferenciasAvisos";
import { MiMote } from "./MiMote";
import { FotoPerfil } from "./FotoPerfil";
import { Aperturas } from "./Aperturas";
import { EligeTablero } from "./EligeTablero";
import { EligePiezas } from "./EligePiezas";
import { EligeAsistente } from "./EligeAsistente";
import { sitioBoton } from "@/lib/asistente/boton";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GrupoAviso } from "@/lib/avisos/politica";

export default async function PerfilPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "email, player_id, avisos_silenciados, tema_tablero, juego_piezas, asistente_boton, players(nombre, apodo, apodo_solicitado, elo_fide, elo_feda, elo_otro, fide_id, feda_id, foto_url, aperturas)"
    )
    .eq("id", user!.id)
    .single();

  // ELO OFICIAL Y NÚMERO DE ORDEN, del orden de fuerza de la temporada activa.
  //
  // POR QUÉ NO BASTA CON `players`: las 46 fichas del club tienen `elo_fide` y
  // `elo_feda` a null —los importadores de FIDE y FEDA no han llegado a rellenarlos—,
  // así que `fuerza()` caía siempre al 1400 de respaldo y esta pantalla le decía a
  // TODO EL MUNDO que su fuerza era 1400. El dato real es `force_order.elo_oficial`,
  // que es además lo que manda en las convocatorias (RGC 52.1).
  const { data: temporadaActiva } = await supabase
    .from("seasons").select("id").eq("activa", true).maybeSingle();
  const { data: filaOrden } = profile?.player_id && temporadaActiva
    ? await supabase
        .from("force_order")
        .select("numero, bis_index, elo_oficial")
        .eq("season_id", temporadaActiva.id)
        .eq("player_id", profile.player_id)
        .maybeSingle()
    : { data: null };

  // Solicitudes de ingreso sin resolver. Esta es la ÚNICA puerta de la junta a
  // esa pantalla: no tiene acceso a /club/admin. Va en el perfil y no en el
  // inicio porque el inicio cuenta lo que pasa en el club, no tareas de gestión.
  const { count: solicitudesPendientes } = sesion?.esJunta
    ? await supabase
        .from("membership_requests")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente")
    : { count: 0 };
  const p = profile?.players as unknown as {
    nombre: string; apodo: string | null; apodo_solicitado: string | null;
    elo_fide: number | null; elo_feda: number | null;
    elo_otro: number | null; fide_id: string | null; feda_id: string | null;
    foto_url: string | null; aperturas: string | null;
  } | null;

  // La URL firmada de la foto, si hay: el bucket es privado (migración 0030) y
  // firmar aquí con la clave de servicio es lo que la hace visible una hora.
  let fotoFirmada: string | null = null;
  if (p?.foto_url) {
    const { data: firma } = await createAdminClient()
      .storage.from("fotos")
      .createSignedUrl(p.foto_url, 3600);
    fotoFirmada = firma?.signedUrl ?? null;
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Mi perfil" subtitulo={profile?.email} volverAtras />
      <Contenedor medida="lectura" className="space-y-4">
        {p ? (
          <Tarjeta destacada className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-tinta">{p.nombre}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* El FIDE ya no va de chip: es la cifra grande. FEDA, solo si
                    algún día vuelve a haber dato. */}
                {p.elo_feda !== null && <ChipElo valor={p.elo_feda} etiqueta="FEDA" />}
                {/* EL ID FIDE, ENLAZADO A SU FICHA OFICIAL (lo pidió un socio el
                    2026-08-13). Lo tienen los 46, así que no es un chip que aparezca
                    a medias. Se abre en otra pestaña porque lleva fuera de la app, y
                    con `noopener` como cualquier enlace externo.

                    El enlace lo abre el NAVEGADOR DEL SOCIO, así que no le afecta que
                    fide.com bloquee las IP de centro de datos — eso solo impide que la
                    app le descargue la lista mensual (ver CLAUDE.md). */}
                {p.fide_id && (
                  <a
                    href={`https://ratings.fide.com/profile/${p.fide_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde"
                    title="Tu ficha en la FIDE"
                  >
                    FIDE {p.fide_id} ↗
                  </a>
                )}
                {filaOrden && (
                  <Link
                    href="/club/orden-fuerza"
                    className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto ring-1 ring-borde-acento"
                  >
                    Nº {filaOrden.numero}
                    {filaOrden.bis_index ? "bis" : ""} del club →
                  </Link>
                )}
              </div>
            </div>
            {/* LA CIFRA GRANDE ES EL ELO REAL: `players.elo_fide`, el FIDE de
                clásicas al día que la sync trae del ranking FACV (la modalidad
                predominante, dicho por el propietario). Si el socio aún no tiene
                ELO de clásicas, se enseña el del orden de fuerza, diciéndolo:
                mejor un número viejo etiquetado que un hueco. Regla de los tres
                ELOs en CLAUDE.md. */}
            {p.elo_fide || filaOrden?.elo_oficial ? (
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-tinta">
                  {p.elo_fide ?? filaOrden?.elo_oficial}
                </p>
                <p className="text-xs uppercase tracking-wide text-tinta-suave">
                  {p.elo_fide ? "ELO clásicas" : "ELO orden de fuerza"}
                </p>
              </div>
            ) : null}
          </Tarjeta>
        ) : (
          <EstadoVacio
            titulo="Sin ficha vinculada todavía"
            detalle="Vincúlate a tu ficha del club para ver tu progreso"
          />
        )}
        {!p && (
          <p className="text-center text-sm">
            <Link href="/club/vincular" className="font-semibold text-acento-texto underline">
              Vincular mi ficha
            </Link>
          </p>
        )}

        {/* EL ORDEN DE ESTA PANTALLA CUENTA UNA HISTORIA (reordenado el
            2026-08-12 a petición del propietario): quién soy → cómo me ven los
            demás → cómo veo yo la app → qué avisos me llegan → atajos → salir.
            Antes eran NUEVE tarjetas sueltas con la gestión metida entre medias,
            los ajustes repartidos en tres sitios y "Cerrar sesión" en el centro
            de la pantalla con cosas debajo. */}

        {/* 1. CÓMO TE VEN LOS DEMÁS. Foto y aperturas van juntas y con el enlace
            a la ficha pública al lado: contestan la misma pregunta, y separarlas
            obligaría a explicarlo dos veces. */}
        {p && profile?.player_id && (
          <Tarjeta className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-tinta">Tu ficha de socio</p>
              <Link
                href={`/club/socios/${profile.player_id}`}
                className="shrink-0 text-xs text-acento-texto underline"
              >
                Ver cómo te ven →
              </Link>
            </div>
            <FotoPerfil fotoUrl={fotoFirmada} nombre={p.nombre} />
            {/* EL MOTE VA AQUÍ y no en "cómo ves tú la app": es cómo te ven los
                DEMÁS, igual que la foto y las aperturas. */}
            <div className="border-t border-borde pt-4">
              <MiMote apodo={p.apodo} apodoSolicitado={p.apodo_solicitado} />
            </div>
            <Aperturas inicial={p.aperturas ?? ""} />
          </Tarjeta>
        )}

        {/* 2. CÓMO VES TÚ LA APP: todo lo visual en una tarjeta —tema, colores del
            tablero y piezas—. Antes el tema vivía en "Ajustes" y el tablero en otra
            tarjeta, que es la misma decisión partida en dos sitios. */}
        {p && (
          <Tarjeta className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-tinta">Cómo se ve la app</p>
              <ThemeToggle />
            </div>
            <div className="border-t border-borde pt-4">
              <EligeTablero actual={(profile?.tema_tablero as string) ?? "gandiblues"} />
            </div>
            <div className="border-t border-borde pt-4">
              <EligePiezas actual={(profile?.juego_piezas as string) ?? "celtic"} />
            </div>
            {/* El botón del asistente va en esta tarjeta y no en la de avisos: es dónde
                se ve una cosa, no si te avisa de algo. */}
            <div className="border-t border-borde pt-4">
              <EligeAsistente actual={sitioBoton(profile?.asistente_boton as string | null)} />
            </div>
          </Tarjeta>
        )}

        {/* 3. QUÉ AVISOS ME LLEGAN, con los pasos en el orden real: instalar la
            app, dar permiso, y luego elegir grupos. Los tres viven en la MISMA
            tarjeta porque son un solo tema; antes instalar y activar estaban en
            "Ajustes" y los grupos en otra tarjeta más abajo. Los interruptores
            son por grupo y no un "avisos sí/no": interclubs, torneos y partidas
            no se parecen, y cada uno molesta o no según a quién le llegue.
            "Gestión" solo se enseña a quien puede recibirlo (`GRUPO_DE` en
            politica.ts). */}
        <PreferenciasAvisos
          silenciadosIniciales={(profile?.avisos_silenciados ?? []) as GrupoAviso[]}
          mostrarGestion={Boolean(sesion?.esAdmin || sesion?.esJunta)}
          antes={
            <>
              {/* `siempre`: en el Perfil se viene A BUSCAR esto, así que dice
                  algo también cuando ya está instalada o cuando el navegador no
                  ofrece el diálogo. En Inicio no lleva la prop y desaparece. */}
              <InstalarApp compacto siempre />
              <ActivarNotificaciones />
            </>
          }
        />

        {/* 4. ATAJOS, en UNA CAJA CON FILAS y no en tres tarjetas sueltas: es el
            patrón de la casa para listas de enlaces de dos líneas (ver la regla
            de "usar el ancho" en CLAUDE.md). La guía va primero porque la usa
            todo el mundo; admin y junta solo salen a quien le tocan. */}
        <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
          <ul className="divide-y divide-borde">
            <FilaEnlace
              href="/club/perfil/guia"
              titulo="¿Qué puedes hacer aquí?"
              detalle="La app, sección a sección"
            />
            {sesion?.esJunta && (
              <FilaEnlace
                href="/club/solicitudes"
                titulo="Solicitudes de ingreso"
                detalle={
                  (solicitudesPendientes ?? 0) === 0
                    ? "Nada pendiente"
                    : `${solicitudesPendientes} sin resolver`
                }
                destacado={(solicitudesPendientes ?? 0) > 0}
              />
            )}
            {/* La puerta a Admin va SIEMPRE, no solo en móvil (petición del
                propietario, 2026-08-10): en escritorio ya está en la barra
                lateral, pero el perfil es donde se busca "lo mío", y una tarjeta
                que aparece y desaparece según el ancho despista más de lo que
                ahorra. */}
            {sesion?.esAdmin && (
              <FilaEnlace
                href="/club/admin"
                titulo="Administración"
                detalle="Equipos, rangos, torneos, ELO y acceso al club"
              />
            )}
          </ul>
        </div>

        {/* 5. SALIR, lo último y solo. Estaba en medio de "Ajustes" con tres
            bloques debajo: el botón de irse no puede tener nada detrás. */}
        <form action={logout}>
          <BotonAccion
            variante="secundario"
            trabajando="Cerrando sesión…"
            className="w-full text-sm font-normal"
          >
            Cerrar sesión
          </BotonAccion>
        </form>
      </Contenedor>
    </main>
  );
}

/**
 * Una fila de la caja de atajos: título, detalle y flecha.
 *
 * Toda la fila es UN enlace, no un enlace dentro de otra cosa: el blanco de
 * toque es la fila entera, que en un móvil es la diferencia entre acertar y no.
 */
function FilaEnlace({
  href,
  titulo,
  detalle,
  destacado = false,
}: {
  href: string;
  titulo: string;
  detalle: string;
  /** Fondo suave cuando hay algo pendiente de verdad. */
  destacado?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-tarjeta-suave ${
          destacado ? "bg-tarjeta-suave" : ""
        }`}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-tinta">{titulo}</span>
          <span className="block text-sm text-tinta-suave">{detalle}</span>
        </span>
        <span aria-hidden className="shrink-0 text-lg text-tinta-suave">
          →
        </span>
      </Link>
    </li>
  );
}
