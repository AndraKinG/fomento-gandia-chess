"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/equipos", label: "Equipos", icon: "♟" },
  { href: "/perfil", label: "Perfil", icon: "👤" },
];

export function BottomNav({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const all = esAdmin
    ? [...items, { href: "/admin", label: "Admin", icon: "⚙️" }]
    : items;
  if (["/login", "/registro"].some((p) => pathname.startsWith(p))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-borde bg-tarjeta p-2">
      {all.map((i) => {
        const activo =
          pathname === i.href ||
          (i.href !== "/" && pathname.startsWith(i.href + "/"));
        return (
          <Link key={i.href} href={i.href}
            aria-current={activo ? "page" : undefined}
            className={`flex flex-col items-center px-3 text-xs ${
              activo ? "font-bold text-acento-fuerte dark:text-acento" : "text-tinta-suave"
            }`}>
            <span className="text-lg">{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
