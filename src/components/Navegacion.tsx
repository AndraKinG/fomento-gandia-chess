"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Inicio de la zona de socios. Es prefijo de todas las demás secciones, así que
 *  solo cuenta como activo con coincidencia exacta: si no, en /club/equipos se
 *  marcarían como activas Inicio y Interclubs a la vez. */
const INICIO = "/club";

/**
 * Secciones de la zona de socios: Inicio · Interclubs · Club · Torneos ·
 * Partidas · Perfil · Admin.
 *
 * `rutas` lista los prefijos que pertenecen a la sección, porque una sección
 * abarca varias pantallas: Interclubs cubre equipos, disponibilidad y jornadas, y
 * todas ellas tienen que dejar su entrada marcada.
 */
const SECCIONES = [
  { href: INICIO, label: "Inicio", icon: "🏠", rutas: [] as string[] },
  {
    href: "/club/equipos",
    label: "Interclubs",
    icon: "♟",
    rutas: ["/club/equipos", "/club/disponibilidad", "/club/jornadas"],
  },
  { href: "/club/interno", label: "Club", icon: "♛", rutas: ["/club/interno"] },
  { href: "/club/torneos", label: "Torneos", icon: "🏆", rutas: ["/club/torneos"] },
  { href: "/club/partidas", label: "Partidas", icon: "♜", rutas: ["/club/partidas"] },
  { href: "/club/perfil", label: "Perfil", icon: "👤", rutas: ["/club/perfil"] },
];

const ADMIN = { href: "/club/admin", label: "Admin", icon: "⚙️", rutas: ["/club/admin"] };

/** Único trozo de este fichero con nombre en inglés: React exige que un hook
 *  empiece por `use` para poder comprobar sus reglas. */
function useSecciones(esAdmin: boolean) {
  const pathname = usePathname();
  const items = esAdmin ? [...SECCIONES, ADMIN] : SECCIONES;
  return items.map((i) => ({
    ...i,
    activo:
      i.href === INICIO
        ? pathname === INICIO
        : i.rutas.some((r) => pathname === r || pathname.startsWith(r + "/")),
  }));
}

/**
 * Navegación de ESCRITORIO: barra lateral fija.
 *
 * En una pantalla grande una barra abajo es la peor opción: el espacio que sobra
 * es horizontal, no vertical, y obliga a bajar la vista hasta el borde inferior
 * del monitor para cambiar de sección. La lateral está siempre a la vista, deja
 * leer las etiquetas completas y libera el ancho para el contenido.
 *
 * Se oculta por debajo de `lg` (1024 px), donde toma el relevo la barra inferior.
 */
export function NavLateral({ esAdmin, email }: { esAdmin: boolean; email: string }) {
  const secciones = useSecciones(esAdmin);

  return (
    <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-borde lg:bg-tarjeta">
      <div className="sticky top-0 flex h-dvh flex-col">
        <Link href={INICIO} className="flex items-center gap-2 px-5 py-5">
          <span aria-hidden className="bg-degradado-club bg-clip-text text-3xl leading-none text-transparent">
            ♞
          </span>
          <span className="text-sm font-bold leading-tight text-tinta">
            Fomento
            <span className="block font-normal text-tinta-suave">de Gandia</span>
          </span>
        </Link>

        <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3">
          {secciones.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={i.activo ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-100 ${
                i.activo
                  ? "bg-acento-fuerte font-semibold text-sobre-acento"
                  : "text-tinta hover:bg-tarjeta-suave"
              }`}
            >
              <span aria-hidden className="text-lg">
                {i.icon}
              </span>
              {i.label}
            </Link>
          ))}
        </nav>

        <p className="truncate px-5 py-4 text-xs text-tinta-suave" title={email}>
          {email}
        </p>
      </div>
    </aside>
  );
}

/**
 * Navegación de MÓVIL: barra inferior fija, al alcance del pulgar.
 *
 * Se oculta a partir de `lg`, donde manda la lateral.
 */
export function NavInferior({ esAdmin }: { esAdmin: boolean }) {
  const secciones = useSecciones(esAdmin);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-borde bg-tarjeta p-2 lg:hidden"
    >
      {secciones.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.activo ? "page" : undefined}
          className={`flex min-w-0 flex-col items-center px-1.5 text-[11px] ${
            i.activo ? "font-bold text-acento-texto" : "text-tinta-suave"
          }`}
        >
          <span aria-hidden className="text-lg">
            {i.icon}
          </span>
          <span className="truncate">{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
