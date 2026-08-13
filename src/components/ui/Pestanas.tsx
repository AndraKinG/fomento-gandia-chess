import Link from "next/link";

/**
 * Pestañas dentro de una pantalla.
 *
 * Estaba escrito a mano dentro de `/club/partidas`, y al partir Torneos en "de
 * fuera" y "del club" hacían falta otras iguales. Duplicarlas era garantizar que
 * dentro de un mes no se parecieran.
 */
export function Pestanas({ children }: { children: React.ReactNode }) {
  // `flex-wrap` como red de seguridad del `whitespace-nowrap` de cada pastilla: si
  // algún día no caben (pantalla estrecha, cuatro pestañas, un idioma más largo), baja
  // una entera a la línea siguiente en vez de partirle el texto o desbordar la fila.
  return <div className="flex flex-wrap gap-2">{children}</div>;
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
      //
      // `whitespace-nowrap` y `px-3` en móvil por un fallo visto en un Redmi 9 Pro con
      // tres pestañas: "★ Favoritas" no cabía y se partía en dos líneas (la estrella
      // arriba y la palabra debajo), lo que estiraba esa pastilla y dejaba a las otras
      // dos pegadas arriba con un hueco debajo. Con tres pestañas el reparto a partes
      // iguales es estrecho, así que el texto no puede romper: antes se aprieta el
      // relleno. El `min-w-0` deja que la pastilla se encoja en vez de desbordar.
      className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-center text-sm font-semibold transition duration-100 sm:flex-initial sm:px-5 ${
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
