"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Inicio de la zona de socios. Es prefijo de todas las demás pestañas, así que
 *  solo cuenta como activa con coincidencia exacta: si no, en /club/equipos se
 *  marcarían como activas Inicio y Equipos a la vez. */
const INICIO = "/club";

/**
 * Secciones de la zona de socios, según la estructura acordada con el
 * propietario: Inicio · Interclubs · Club · Torneos · Perfil · Admin.
 *
 * **Falta "Club"** (torneos locales con ELO propio y repositorio de partidas) y
 * no está por decisión, no por olvido: no tiene ni una pantalla todavía —llega
 * con las Fases 3 y 4— y una pestaña que no lleva a ningún sitio es peor que no
 * tenerla. Se añade aquí en cuanto haya algo detrás.
 *
 * `rutas` lista los prefijos que pertenecen a la sección, porque una sección
 * abarca varias rutas: Interclubs cubre equipos, disponibilidad y jornadas, y
 * todas ellas tienen que dejar su pestaña marcada.
 */
const SECCIONES = [
  { href: INICIO, label: "Inicio", icon: "🏠", rutas: [] as string[] },
  {
    href: "/club/equipos",
    label: "Interclubs",
    icon: "♟",
    rutas: ["/club/equipos", "/club/disponibilidad", "/club/jornadas"],
  },
  { href: "/club/torneos", label: "Torneos", icon: "🏆", rutas: ["/club/torneos"] },
  { href: "/club/partidas", label: "Partidas", icon: "♜", rutas: ["/club/partidas"] },
  { href: "/club/perfil", label: "Perfil", icon: "👤", rutas: ["/club/perfil"] },
];

const ADMIN = { href: "/club/admin", label: "Admin", icon: "⚙️", rutas: ["/club/admin"] };

export function BottomNav({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const items = esAdmin ? [...SECCIONES, ADMIN] : SECCIONES;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 flex justify-around border-t border-borde bg-tarjeta p-2"
    >
      {items.map((i) => {
        const activo =
          i.href === INICIO
            ? pathname === INICIO
            : i.rutas.some((r) => pathname === r || pathname.startsWith(r + "/"));
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activo ? "page" : undefined}
            className={`flex flex-col items-center px-2 text-xs ${
              activo ? "font-bold text-acento-texto" : "text-tinta-suave"
            }`}
          >
            <span aria-hidden className="text-lg">
              {i.icon}
            </span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
