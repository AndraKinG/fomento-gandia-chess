"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/perfil", label: "Perfil", icon: "♟" },
];

export function BottomNav({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const all = esAdmin
    ? [...items, { href: "/admin", label: "Admin", icon: "⚙️" }]
    : items;
  if (["/login", "/registro"].some((p) => pathname.startsWith(p))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t bg-white p-2">
      {all.map((i) => (
        <Link key={i.href} href={i.href}
          className={`flex flex-col items-center px-3 text-xs ${
            pathname === i.href ||
            (i.href !== "/" && pathname.startsWith(i.href + "/"))
              ? "font-bold"
              : "text-gray-500"
          }`}>
          <span className="text-lg">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
