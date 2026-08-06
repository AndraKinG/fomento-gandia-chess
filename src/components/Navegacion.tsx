"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Escudo } from "@/components/ui/Escudo";
import {
  IconoAdmin,
  IconoClub,
  IconoInicio,
  IconoInterclubs,
  IconoPartidas,
  IconoPerfil,
  IconoTorneos,
} from "@/components/ui/Iconos";

/** Inicio de la zona de socios. Es prefijo de todas las demás secciones, así que
 *  solo cuenta como activo con coincidencia exacta: si no, en /club/equipos se
 *  marcarían como activas Inicio y Interclubs a la vez. */
const INICIO = "/club";

type Seccion = {
  href: string;
  label: string;
  Icono: (p: { className?: string }) => React.ReactElement;
  rutas: string[];
  /** false = fuera de la barra inferior del móvil. Siete pestañas no caben en un
   *  teléfono: las etiquetas se cortan y los toques se pisan. */
  enMovil?: boolean;
};

/**
 * Secciones de la zona de socios.
 *
 * `rutas` lista los prefijos que pertenecen a la sección, porque una sección
 * abarca varias pantallas: Interclubs cubre equipos, disponibilidad y jornadas, y
 * todas ellas tienen que dejar su entrada marcada.
 */
const SECCIONES: Seccion[] = [
  { href: INICIO, label: "Inicio", Icono: IconoInicio, rutas: [] },
  {
    href: "/club/equipos",
    label: "Interclubs",
    Icono: IconoInterclubs,
    rutas: ["/club/equipos", "/club/disponibilidad", "/club/jornadas"],
  },
  { href: "/club/interno", label: "Club", Icono: IconoClub, rutas: ["/club/interno"] },
  { href: "/club/torneos", label: "Torneos", Icono: IconoTorneos, rutas: ["/club/torneos"] },
  {
    href: "/club/partidas",
    label: "Partidas",
    Icono: IconoPartidas,
    rutas: ["/club/partidas"],
  },
  {
    href: "/club/perfil",
    label: "Perfil",
    Icono: IconoPerfil,
    rutas: ["/club/perfil", "/club/solicitudes"],
  },
];

/** Admin no entra en la barra del móvil: son nueve pantallas de gestión que se
 *  usan sentado delante del ordenador, y en el teléfono se llega desde Perfil. */
const ADMIN: Seccion = {
  href: "/club/admin",
  label: "Admin",
  Icono: IconoAdmin,
  rutas: ["/club/admin"],
  enMovil: false,
};

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
        <Link href={INICIO} className="flex items-center gap-2.5 px-5 py-5">
          <Escudo lado={34} className="shrink-0" />
          <span className="text-sm font-bold leading-tight text-tinta">
            Fomento
            <span className="block font-normal text-tinta-suave">de Gandia</span>
          </span>
        </Link>

        <nav aria-label="Navegación principal" className="flex-1 space-y-0.5 px-3">
          {secciones.map(({ href, label, Icono, activo }) => (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-100 ${
                activo
                  ? "bg-acento-fuerte font-semibold text-sobre-acento"
                  : "text-tinta hover:bg-tarjeta-suave"
              }`}
            >
              <Icono className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <p className="truncate border-t border-borde px-5 py-3.5 text-xs text-tinta-suave" title={email}>
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
  const secciones = useSecciones(esAdmin).filter((i) => i.enMovil !== false);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-borde bg-tarjeta pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {secciones.map(({ href, label, Icono, activo }) => (
        <Link
          key={href}
          href={href}
          aria-current={activo ? "page" : undefined}
          // `basis-0 grow` reparte el ancho a partes iguales sin que la etiqueta
          // más larga se lleve más sitio que las demás.
          className={`flex min-w-0 basis-0 grow flex-col items-center gap-0.5 px-0.5 pb-2 pt-2 text-[10px] ${
            activo ? "font-bold text-acento-texto" : "text-tinta-suave"
          }`}
        >
          <Icono className="h-5 w-5 shrink-0" />
          <span className="w-full truncate text-center">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
