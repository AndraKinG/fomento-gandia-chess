import Link from "next/link";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Contenedor, Rejilla } from "@/components/ui/Contenedor";
import { createServerSupabase } from "@/lib/supabase/server";

const ENLACES = [
  {
    href: "/club/admin/orden-fuerza",
    icono: "📋",
    titulo: "ELO de los socios",
    detalle: "La lista oficial FACV: sincronizar, crear fichas e importar la temporada",
  },
  {
    href: "/club/admin/acceso",
    icono: "🔑",
    titulo: "Acceso al club",
    detalle: "Código de registro para los socios: ver, regenerar o cerrar",
  },
  {
    href: "/club/admin/vinculaciones",
    icono: "🔗",
    titulo: "Vinculaciones",
    detalle: "Aprobar o rechazar solicitudes de vinculación pendientes",
  },
  {
    href: "/club/admin/roles",
    icono: "🎖️",
    titulo: "Rangos",
    detalle: "Nombrar junta y admin; ver quién es jugador y capitán",
  },
  {
    href: "/club/admin/equipos",
    icono: "🛡️",
    titulo: "Equipos y capitanes",
    detalle: "Dar de alta equipos de la temporada y nombrar capitanes",
  },
  {
    href: "/club/admin/torneos",
    icono: "🏆",
    titulo: "Torneos",
    detalle: "Sincronizar el calendario FACV, elegir a cuáles vamos y ver el transporte",
  },
  {
    href: "/club/admin/elo",
    icono: "📈",
    titulo: "Actualización de ELO",
    detalle: "Actualizar el ELO FIDE y FEDA de los jugadores",
  },
  {
    href: "/club/admin/uso",
    icono: "📊",
    titulo: "Datos de uso",
    detalle: "Socios activos, visitas, tiempo de uso y actividad, por día, semana y mes",
  },
  {
    href: "/club/admin/push",
    icono: "🔔",
    titulo: "Notificaciones",
    detalle: "Enviar notificaciones push de prueba",
  },
  {
    href: "/club/admin/diseno",
    icono: "🎨",
    titulo: "Diseño",
    detalle: "Biblioteca de componentes y estilos de la app",
  },
] as const;

export default async function AdminPage() {
  // Las solicitudes pendientes se cuentan aquí para poder avisar en la propia
  // rejilla. Sin el aviso, una solicitud puede pasar semanas esperando: nada en
  // Administración distingue "Vinculaciones" con trabajo pendiente de sin él, y
  // el push solo llega al aparato donde alguien aceptó las notificaciones.
  const supabase = await createServerSupabase();
  const { count: pendientes } = await supabase
    .from("link_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendiente");

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Administración" medida="panel" />
      <Contenedor medida="panel">
        <nav aria-label="Secciones de administración">
          {/* Nueve opciones en una sola columna obligan a recorrer la pantalla de
              arriba abajo; en tres columnas se ven todas de un vistazo. */}
          <Rejilla columnas={3}>
            {ENLACES.map((enlace) => {
              const aviso =
                enlace.href === "/club/admin/vinculaciones" ? (pendientes ?? 0) : 0;
              return (
                <Link key={enlace.href} href={enlace.href}>
                  <Tarjeta className="flex h-full items-center gap-3 transition hover:border-borde-acento">
                    <span aria-hidden className="text-2xl">
                      {enlace.icono}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-tinta">
                        {enlace.titulo}
                        {aviso > 0 && (
                          <span className="rounded-full bg-acento-fuerte px-2 py-0.5 text-xs font-bold text-sobre-acento">
                            {aviso}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-tinta-suave">{enlace.detalle}</p>
                    </div>
                  </Tarjeta>
                </Link>
              );
            })}
          </Rejilla>
        </nav>
      </Contenedor>
    </main>
  );
}
