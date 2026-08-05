"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Inicio de la zona de socios. Es prefijo de todas las demás pestañas, así que
 *  solo cuenta como activa con coincidencia exacta: si no, en /club/equipos se
 *  marcarían como activas Inicio y Equipos a la vez. */
const INICIO = "/club";

const items = [
  { href: INICIO, label: "Inicio", icon: "🏠" },
  { href: "/club/equipos", label: "Equipos", icon: "♟" },
  { href: "/club/perfil", label: "Perfil", icon: "👤" },
];

export function BottomNav({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const all = esAdmin
    ? [...items, { href: "/club/admin", label: "Admin", icon: "⚙️" }]
    : items;
  // Ya no hace falta esconderla en login/registro: solo la pinta el layout de
  // /club, que es donde tiene sentido.
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 flex justify-around border-t border-borde bg-tarjeta p-2"
    >
      {all.map((i) => {
        const activo =
          i.href === INICIO
            ? pathname === INICIO
            : pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href}
            aria-current={activo ? "page" : undefined}
            className={`flex flex-col items-center px-3 text-xs ${
              activo ? "font-bold text-acento-texto" : "text-tinta-suave"
            }`}>
            <span className="text-lg">{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
