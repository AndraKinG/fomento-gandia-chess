"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePendientes } from "@/components/avisos/Pendientes";
import { Escudo } from "@/components/ui/Escudo";
import {
  IconoAdmin,
  IconoAvisos,
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
  // Entrada PROPIA y SIEMPRE VISIBLE de la bandeja de avisos (`/club/avisos`).
  // Antes no existía: el único enlace a la bandeja era el número rojo de
  // Jugar, así que "¿a mí no me llegó nada?" —justo lo que la bandeja existe
  // para responder— solo se podía comprobar cuando ya tenías algo sin leer.
  // Sexta pestaña del móvil: siguen cabiendo seis, como dice el comentario de
  // Jugar más abajo.
  // NO VA EN LA BARRA DE ABAJO desde el 2026-08-12 (petición del propietario):
  // en móvil vive ARRIBA, junto al perfil, que es donde todo el mundo pone la
  // campana. De paso la barra inferior baja de seis pestañas a cinco y respira.
  {
    href: "/club/avisos",
    label: "Avisos",
    Icono: IconoAvisos,
    rutas: ["/club/avisos"],
    enMovil: false,
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
 * El número (si lo hay) que le toca al badge de una sección, y la frase que lo
 * explica a quien no lo ve.
 *
 * SOLO DOS SECCIONES LLEVAN NÚMERO, y cada una el SUYO, no una suma: Jugar
 * cuenta retos pendientes (te han retado, decides tú) y Avisos cuenta avisos
 * sin leer (la bandeja). Antes era un único número —la suma de los dos— sobre
 * Jugar, y ese número llevaba a la bandeja: tocar el único sitio rojo de la
 * pantalla con un reto pendiente aterrizaba en "Avisos", que decía "sin
 * avisos", porque un reto no es ningún tipo de esa tabla. Con una entrada
 * propia para Avisos, cada número cuenta lo suyo y lleva a lo suyo.
 */
function contadorDe(
  href: string,
  pendientes: { avisos: number; retos: number }
): { cuantos: number; etiqueta: string } | null {
  if (href === "/club/jugar") {
    const n = pendientes.retos;
    return { cuantos: n, etiqueta: n === 1 ? "1 reto pendiente" : `${n} retos pendientes` };
  }
  if (href === "/club/avisos") {
    const n = pendientes.avisos;
    return { cuantos: n, etiqueta: n === 1 ? "1 aviso sin leer" : `${n} avisos sin leer` };
  }
  return null;
}

/**
 * El icono de una sección con su badge encima, si le toca uno.
 *
 * El badge es un `<span aria-hidden>` DECORATIVO, nunca un enlace: antes lo
 * era (llevaba a la bandeja aunque estuviera sobre Jugar) y eso eran DOS
 * problemas juntos — un `<a>` dentro de otro `<a>` es HTML inválido y el clic
 * dejaba de ser fiable, y encima el blanco de toque de ~14 px quedaba por
 * debajo del mínimo de 24×24 px de WCAG 2.5.8. Ahora toda la fila es un único
 * enlace (a Jugar o a Avisos, cada uno el suyo) y el número se entera por el
 * `aria-label` de ESE enlace, no por el badge.
 */
function IconoConBadge({
  Icono,
  className,
  info,
}: {
  Icono: (p: { className?: string }) => React.ReactElement;
  className: string;
  info: { cuantos: number; etiqueta: string } | null;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Icono className={className} />
      {info && info.cuantos > 0 && (
        <span
          aria-hidden
          className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-acento-fuerte px-1 text-[10px] font-bold leading-none text-sobre-acento"
        >
          {info.cuantos}
        </span>
      )}
    </span>
  );
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
  // Retos pendientes y avisos sin leer, en vivo (ver Pendientes.tsx). Cada uno
  // sale sobre SU icono: retos sobre Jugar, avisos sin leer sobre Avisos.
  const pendientes = usePendientes();

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
          {secciones.map(({ href, label, Icono, activo }) => {
            const info = contadorDe(href, pendientes);
            return (
              <Link
                key={href}
                href={href}
                aria-current={activo ? "page" : undefined}
                aria-label={info && info.cuantos > 0 ? `${label}. ${info.etiqueta}` : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-100 ${
                  activo
                    ? "bg-acento-fuerte font-semibold text-sobre-acento"
                    : "text-tinta hover:bg-tarjeta-suave"
                }`}
              >
                <IconoConBadge Icono={Icono} className="h-5 w-5 shrink-0" info={info} />
                {label}
              </Link>
            );
          })}
        </nav>

        <p className="truncate border-t border-borde px-5 py-3.5 text-xs text-tinta-suave" title={email}>
          {email}
        </p>
      </div>
    </aside>
  );
}

/**
 * Avisos y perfil: a la derecha de la cabecera, SOLO en móvil.
 *
 * Están aquí y no en la barra de abajo por sitio: siete pestañas no caben en un
 * teléfono, y estas dos son las que todo el mundo espera arriba a la derecha
 * —campana y avatar—. Liberan dos huecos abajo para lo que se usa a diario.
 * (Avisos subió aquí el 2026-08-12, a petición del propietario.)
 *
 * VAN DENTRO DE LA CABECERA, no flotando encima. Flotando se comían el título en las
 * pantallas de nombre largo: la franja azul y el botón no se ponían de acuerdo
 * sobre de quién era ese trozo de pantalla. Como parte de la fila, el título
 * simplemente se corta antes de llegar.
 *
 * En escritorio no existen: la barra lateral ya los lleva.
 */
export function AccesoPerfil() {
  const pathname = usePathname();
  const pendientes = usePendientes();
  const enPerfil = pathname.startsWith("/club/perfil");
  const enAvisos = pathname.startsWith("/club/avisos");
  const avisos = contadorDe("/club/avisos", pendientes);

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:hidden">
      <Link
        href="/club/avisos"
        // El número va en el aria-label del ENLACE y no en el badge, que es
        // decorativo: así quien no ve el rojo se entera igual (misma decisión
        // que en las dos barras de navegación).
        aria-label={avisos && avisos.cuantos > 0 ? `Avisos: ${avisos.etiqueta}` : "Avisos"}
        aria-current={enAvisos ? "page" : undefined}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
          enAvisos ? "bg-white/30" : "bg-white/15 hover:bg-white/25"
        }`}
      >
        <IconoConBadge Icono={IconoAvisos} className="h-5 w-5" info={avisos} />
      </Link>
      <Link
        href="/club/perfil"
        aria-label="Tu perfil"
        aria-current={enPerfil ? "page" : undefined}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
          enPerfil ? "bg-white/30" : "bg-white/15 hover:bg-white/25"
        }`}
      >
        <IconoPerfil className="h-5 w-5" />
      </Link>
    </div>
  );
}

/**
 * Navegación de MÓVIL: barra inferior fija, al alcance del pulgar.
 *
 * Se oculta a partir de `lg`, donde manda la lateral.
 */
export function NavInferior({ esAdmin }: { esAdmin: boolean }) {
  const secciones = useSecciones(esAdmin).filter((i) => i.enMovil !== false);
  const pendientes = usePendientes();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-borde bg-tarjeta pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {secciones.map(({ href, label, Icono, activo }) => {
        const info = contadorDe(href, pendientes);
        return (
          // `basis-0 grow` reparte el ancho a partes iguales sin que la
          // etiqueta más larga se lleve más sitio que las demás.
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            aria-label={info && info.cuantos > 0 ? `${label}. ${info.etiqueta}` : undefined}
            className={`flex min-w-0 basis-0 grow flex-col items-center gap-0.5 px-0.5 pb-2 pt-2 text-[10px] ${
              activo ? "font-bold text-acento-texto" : "text-tinta-suave"
            }`}
          >
            <IconoConBadge Icono={Icono} className="h-5 w-5 shrink-0" info={info} />
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
