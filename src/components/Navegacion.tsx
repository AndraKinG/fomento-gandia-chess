"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Escudo } from "@/components/ui/Escudo";
import {
  IconoAdmin,
  IconoInicio,
  IconoInterclubs,
  IconoJugar,
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
    rutas: [
      "/club/equipos",
      "/club/disponibilidad",
      "/club/jornadas",
      "/club/orden-fuerza",
    ],
  },
  // Una sola entrada para los dos tipos de torneo, con pestañas dentro: para el
  // socio los dos son "torneos", y separarlos en dos secciones dejaba siete
  // pestañas que no caben en un móvil. `rutas` es el prefijo padre, así que la
  // entrada queda marcada tanto en los de fuera como en los del club.
  //
  // APUNTA DIRECTO A LA PESTAÑA, no a `/club/torneos`. Esa ruta es un redirect, y
  // pasar por ella se notaba: esqueleto de carga, salto, y esqueleto otra vez. El
  // redirect sigue existiendo, pero solo para los enlaces viejos de las
  // notificaciones push ya enviadas, que es para lo que se hizo.
  {
    href: "/club/torneos/facv",
    label: "Torneos",
    Icono: IconoTorneos,
    rutas: ["/club/torneos"],
  },
  // Jugar va ANTES de Partidas porque son lo mismo visto de dos maneras: aquí se
  // juegan y allí se guardan. Seis pestañas siguen cabiendo en un móvil; siete no,
  // que por eso Torneos se fusionó en su día.
  {
    href: "/club/jugar",
    label: "Jugar",
    Icono: IconoJugar,
    rutas: ["/club/jugar"],
  },
  {
    href: "/club/partidas",
    label: "Partidas",
    Icono: IconoPartidas,
    rutas: ["/club/partidas"],
  },
  // Perfil NO va en la barra de abajo: vive arriba a la derecha, fijo, en
  // `AccesoPerfil`. Es de las que menos se tocan y liberar ese hueco deja que las
  // cinco que sí se usan a diario quepan sin apretarse en un teléfono.
  {
    href: "/club/perfil",
    label: "Perfil",
    Icono: IconoPerfil,
    rutas: ["/club/perfil", "/club/solicitudes"],
    enMovil: false,
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
 * Acceso al perfil: a la derecha de la cabecera, SOLO en móvil.
 *
 * Está aquí y no en la barra de abajo por sitio: siete pestañas no caben en un
 * teléfono y Perfil es de las que menos se tocan, así que sube arriba —donde lo
 * pone todo el mundo— y libera un hueco abajo para lo que se usa a diario.
 *
 * VA DENTRO DE LA CABECERA, no flotando encima. Flotando se comía el título en las
 * pantallas de nombre largo: la franja azul y el botón no se ponían de acuerdo
 * sobre de quién era ese trozo de pantalla. Como parte de la fila, el título
 * simplemente se corta antes de llegar.
 *
 * En escritorio no existe: la barra lateral ya lo lleva.
 */
export function AccesoPerfil() {
  const pathname = usePathname();
  const activo = pathname.startsWith("/club/perfil");
  return (
    <Link
      href="/club/perfil"
      aria-label="Tu perfil"
      aria-current={activo ? "page" : undefined}
      className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition lg:hidden ${
        activo ? "bg-white/30" : "bg-white/15 hover:bg-white/25"
      }`}
    >
      <IconoPerfil className="h-5 w-5" />
    </Link>
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
