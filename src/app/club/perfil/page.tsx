import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { fuerza } from "@/lib/elo/fuerza";
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
          <Tarjeta destacada>
            <p className="text-lg font-semibold text-tinta">{p.nombre}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChipElo valor={p.elo_fide} etiqueta="FIDE" />
              <ChipElo valor={p.elo_feda} etiqueta="FEDA" />
              <ChipElo
                valor={fuerza({ eloFide: p.elo_fide, eloFeda: p.elo_feda, eloOtro: p.elo_otro })}
                etiqueta="Fuerza"
              />
            </div>
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

        <ThemeToggle />
        <ActivarNotificaciones />
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
