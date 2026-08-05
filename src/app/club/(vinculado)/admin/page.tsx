import Link from "next/link";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";

const ENLACES = [
  {
    href: "/club/admin/orden-fuerza",
    icono: "📋",
    titulo: "Orden de fuerza",
    detalle: "Importar y consultar el orden de fuerza de la temporada",
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

export default function AdminPage() {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Administración" />
      <nav
        aria-label="Secciones de administración"
        className="mx-auto flex max-w-md flex-col gap-3 p-4"
      >
        {ENLACES.map((enlace) => (
          <Link key={enlace.href} href={enlace.href}>
            <Tarjeta className="flex items-center gap-3 transition hover:border-borde-acento">
              <span aria-hidden className="text-2xl">
                {enlace.icono}
              </span>
              <div>
                <p className="font-semibold text-tinta">{enlace.titulo}</p>
                <p className="text-sm text-tinta-suave">{enlace.detalle}</p>
              </div>
            </Tarjeta>
          </Link>
        ))}
      </nav>
    </main>
  );
}
