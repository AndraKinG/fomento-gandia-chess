import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { ActivarNotificaciones } from "@/components/PushSubscriber";
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

export default async function PerfilPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, player_id, players(nombre, elo_fide, elo_feda, elo_otro, fide_id, feda_id)")
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
  } | null;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Mi perfil" subtitulo={profile?.email} />
      <Contenedor medida="lectura" className="space-y-4">
        {p ? (
          <Tarjeta destacada className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-tinta">{p.nombre}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* FIDE y FEDA solo si los tiene: hoy no los tiene nadie, y tres
                    chips con un guion no dicen nada. */}
                {p.elo_fide !== null && <ChipElo valor={p.elo_fide} etiqueta="FIDE" />}
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
            {filaOrden?.elo_oficial ? (
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-tinta">
                  {filaOrden.elo_oficial}
                </p>
                <p className="text-xs uppercase tracking-wide text-tinta-suave">
                  ELO oficial
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
        {/* Puerta a la administración SOLO en móvil: Admin salió de la barra
            inferior porque siete pestañas no caben en un teléfono, y en escritorio
            ya está en la barra lateral. Sin esto, en el móvil no habría forma de
            llegar. */}
        {sesion?.esAdmin && (
          <Link href="/club/admin" className="block lg:hidden">
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

        {/* Los tres ajustes juntos en una tarjeta. Sueltos eran tres barras a todo lo
            ancho, una de ellas en degradado, que pesaban más que la propia ficha. */}
        <Tarjeta className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-tinta">Ajustes</p>
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
      </Contenedor>
    </main>
  );
}
