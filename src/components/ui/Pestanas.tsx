import Link from "next/link";

/**
 * Pestañas dentro de una pantalla.
 *
 * Estaba escrito a mano dentro de `/club/partidas`, y al partir Torneos en "de
 * fuera" y "del club" hacían falta otras iguales. Duplicarlas era garantizar que
 * dentro de un mes no se parecieran.
 */
export function Pestanas({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2">{children}</div>;
}

export function Pestana({
  href,
  activa,
  children,
}: {
  href: string;
  activa: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activa ? "page" : undefined}
      // A lo ancho en móvil, donde importa el tamaño del toque; compacta desde `sm`.
      // Estiradas ocupaban media pantalla cada una y competían con el contenido.
      className={`flex-1 rounded-xl px-4 py-2 text-center text-sm font-semibold transition duration-100 sm:flex-initial sm:px-5 ${
        activa
          ? "bg-acento-fuerte text-sobre-acento"
          : "border border-borde bg-tarjeta text-tinta-suave hover:bg-tarjeta-suave"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Las dos pestañas de la sección Jugar.
 *
 * LOS TORNEOS DEL CLUB VIVEN EN JUGAR desde el 2026-08-11 (decisión del
 * propietario): son partidas que se juegan EN la app, como los retos — mientras
 * que la sección Torneos es pura organización de los de fuera (si vas, coches).
 * El criterio que separa ya no es "cómo se llama la cosa" sino "dónde se juega".
 */
export function PestanasJugar({ activa }: { activa: "retos" | "torneos" }) {
  return (
    <Pestanas>
      <Pestana href="/club/jugar" activa={activa === "retos"}>
        Retos
      </Pestana>
      <Pestana href="/club/jugar/torneos" activa={activa === "torneos"}>
        Torneos del club
      </Pestana>
    </Pestanas>
  );
}
