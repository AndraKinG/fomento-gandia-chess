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
 * Las dos pestañas de la sección Torneos.
 *
 * POR QUÉ ESTÁN JUNTOS LOS DOS TIPOS: es una sección, no dos, porque para el socio
 * los dos son "torneos". Pero NO se mezclan en una sola lista con filtro, porque lo
 * que haces en cada uno no se parece: en los de fuera dices si vas y se organizan
 * los coches —logística—, y en los del club te inscribes, te emparejan y el
 * resultado cuenta para el ELO interno —competición—.
 *
 * "De fuera" va primero y es la que se abre por defecto: el calendario de la FACV
 * se usa todo el año, mientras que un torneo interno solo existe de vez en cuando
 * (y cuando existe, ya sale destacado en Inicio).
 */
export function PestanasTorneos({ activa }: { activa: "facv" | "interno" }) {
  return (
    <Pestanas>
      <Pestana href="/club/torneos/facv" activa={activa === "facv"}>
        De fuera
      </Pestana>
      <Pestana href="/club/torneos/interno" activa={activa === "interno"}>
        Del club
      </Pestana>
    </Pestanas>
  );
}
