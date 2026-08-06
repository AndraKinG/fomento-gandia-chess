import Link from "next/link";
import { ANCHOS, type Medida } from "@/components/ui/Contenedor";
import { Escudo } from "@/components/ui/Escudo";

/**
 * Cabecera de pantalla: franja azul con el título.
 *
 * `medida` TIENE que ser la misma que la del `Contenedor` de la pantalla. La
 * franja ocupa todo el ancho pero su texto se alinea con el contenido de abajo, y
 * si las dos medidas no coinciden el título queda desplazado respecto a las
 * tarjetas.
 */
export function Cabecera({
  titulo,
  subtitulo,
  volverA,
  medida = "lectura",
}: {
  titulo: string;
  subtitulo?: string;
  volverA?: string;
  medida?: Medida;
}) {
  return (
    <header className="bg-degradado-club px-4 pb-4 pt-5 text-sobre-acento sm:px-6">
      <div className={`mx-auto flex w-full ${ANCHOS[medida]} items-center gap-3`}>
        {volverA && (
          <Link
            href={volverA}
            aria-label="Volver"
            className="-ml-1 shrink-0 rounded-lg px-1 text-2xl leading-none text-sobre-acento transition hover:bg-white/15"
          >
            ←
          </Link>
        )}
        {/* En escritorio el escudo ya está en la barra lateral: repetirlo aquí
            es ruido. */}
        <Escudo lado={30} className="shrink-0 lg:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight sm:text-2xl">{titulo}</h1>
          {subtitulo && <p className="truncate text-sm opacity-90">{subtitulo}</p>}
        </div>
      </div>
    </header>
  );
}
