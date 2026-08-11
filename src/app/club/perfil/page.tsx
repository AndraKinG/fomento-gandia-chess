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
import { FotoPerfil } from "./FotoPerfil";
import { Aperturas } from "./Aperturas";
import { EligeTablero } from "./EligeTablero";
import { EligePiezas } from "./EligePiezas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GrupoAviso } from "@/lib/avisos/politica";

export default async function PerfilPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "email, player_id, avisos_silenciados, tema_tablero, juego_piezas, players(nombre, elo_fide, elo_feda, elo_otro, fide_id, feda_id, foto_url, aperturas)"
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
    nombre: string; elo_fide: number | null; elo_feda: number | null;
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
        {/* Puerta a la administración SIEMPRE visible (petición del propietario,
            2026-08-10). Nació solo para móvil —en escritorio Admin ya está en la
            barra lateral— pero el perfil es donde se busca "lo mío", y que la
            tarjeta aparezca y desaparezca según el ancho de pantalla despista más
            de lo que ahorra. */}
        {sesion?.esAdmin && (
          <Link href="/club/admin" className="block">
            <Tarjeta className="flex items-center justify-between gap-3 transition hover:border-borde-acento">
              <div>
                <p className="font-semibold text-tinta">Administración</p>
                <p className="text-sm text-tinta-suave">
                  Equipos, rangos, torneos, ELO y acceso al club
                </p>
              </div>
              <span aria-hidden className="text-lg text-tinta-suave">
                →
              </span>
            </Tarjeta>
          </Link>
        )}

        {sesion?.esJunta && (
          <Link href="/club/solicitudes" className="block">
            <Tarjeta
              destacada={(solicitudesPendientes ?? 0) > 0}
              className="flex items-center justify-between gap-3 transition hover:border-borde-acento"
            >
              <div>
                <p className="font-semibold text-tinta">Solicitudes de ingreso</p>
                <p className="text-sm text-tinta-suave">
                  {(solicitudesPendientes ?? 0) === 0
                    ? "Nada pendiente"
                    : `${solicitudesPendientes} sin resolver`}
                </p>
              </div>
              <span aria-hidden className="text-lg text-tinta-suave">
                →
              </span>
            </Tarjeta>
          </Link>
        )}

        {/* LO QUE LOS DEMÁS VEN DE TI: foto y aperturas van juntas y con el enlace
            a la ficha pública al lado, porque la pregunta que contestan es la misma
            — "¿cómo me ven?" — y separarlas obligaría a explicarlo dos veces. */}
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
            <Aperturas inicial={p.aperturas ?? ""} />
          </Tarjeta>
        )}

        {/* El tablero a su aire y no dentro de Ajustes: es la elección más visual
            de la pantalla y entre dos botones de texto no se ve. */}
        {p && (
          <Tarjeta className="flex flex-col gap-4">
            <EligeTablero actual={(profile?.tema_tablero as string) ?? "gandiblues"} />
            <div className="border-t border-borde pt-4">
              <EligePiezas actual={(profile?.juego_piezas as string) ?? "celtic"} />
            </div>
          </Tarjeta>
        )}

        {/* La guía de la app. Desde el perfil y no desde la navegación: se mira al
            llegar y de tarde en tarde, no cada día. */}
        <Link href="/club/perfil/guia" className="block">
          <Tarjeta className="flex items-center justify-between gap-3 transition hover:border-borde-acento">
            <div>
              <p className="font-semibold text-tinta">¿Qué puedes hacer aquí?</p>
              <p className="text-sm text-tinta-suave">
                La app, sección a sección
              </p>
            </div>
            <span aria-hidden className="text-lg text-tinta-suave">
              →
            </span>
          </Tarjeta>
        </Link>

        {/* Los tres ajustes juntos en una tarjeta. Sueltos eran tres barras a todo lo
            ancho, una de ellas en degradado, que pesaban más que la propia ficha. */}
        <Tarjeta className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-tinta">Ajustes</p>
          {/* Instalar va JUNTO a las notificaciones y antes que ellas: en iPhone
              no hay avisos hasta que la app está en la pantalla de inicio, así
              que este es el orden en que hay que hacer las dos cosas. Se
              esconde solo cuando ya está instalada. */}
          <InstalarApp compacto />
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <ActivarNotificaciones />
          </div>
          <form action={logout} className="border-t border-borde pt-3">
            <BotonAccion
              variante="secundario"
              trabajando="Cerrando sesión…"
              className="text-sm font-normal"
            >
              Cerrar sesión
            </BotonAccion>
          </form>
        </Tarjeta>

        {/* Por grupo, y no un único interruptor "avisos sí/no": interclubs,
            torneos y partidas no se parecen entre sí y cada uno molesta o
            no según a quién le llegue. "Gestión" solo se enseña a quien
            puede recibirlo (ver `GRUPO_DE` en politica.ts): a un jugador
            normal no le llega nunca, así que mostrárselo apagado y sin
            efecto solo confundiría. */}
        <PreferenciasAvisos
          silenciadosIniciales={(profile?.avisos_silenciados ?? []) as GrupoAviso[]}
          mostrarGestion={Boolean(sesion?.esAdmin || sesion?.esJunta)}
        />
      </Contenedor>
    </main>
  );
}
