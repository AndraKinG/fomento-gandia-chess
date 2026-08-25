/**
 * Una cifra grande con su título y su nota.
 *
 * Vive en su propio fichero porque la usan la página (servidor) y `EnLineaAhora`
 * (cliente): tenerla en dos sitios acabaría con dos tarjetas distintas.
 */
export function Dato({
  titulo,
  valor,
  nota,
  vivo = false,
}: {
  titulo: string;
  valor: string;
  /** La línea pequeña que le da sentido al número: un dato sin referencia
   *  ("3 activos") no dice si es bueno o malo. */
  nota?: string;
  /** true en los que se mueven solos, para marcarlos con el punto verde. */
  vivo?: boolean;
}) {
  return (
    // NADA SE SALE DE LA TARJETA EN UN MÓVIL, que es lo que pasaba: en pantalla
    // estrecha estas tarjetas van a DOS COLUMNAS, así que cada una mide unos 140 px de
    // contenido, y ahí un valor como "12 h 30 min" a 24 px o un título largo se salían
    // por el borde. Tres cosas lo evitan y las tres hacen falta:
    //
    // - `overflow-hidden` en la tarjeta: el corte último, para que nada pinte fuera.
    // - `text-xl sm:text-2xl`: la cifra se achica solo en móvil. Es la que más manda
    //   en el ancho, y de 24 a 20 px se gana casi una quinta parte.
    // - `break-words` y `min-w-0`: sin `min-w-0` un hijo de un flex NO se encoge por
    //   debajo de su contenido —se sale— aunque el padre no tenga sitio.
    <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta p-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-xl font-bold leading-tight tabular-nums text-tinta sm:text-2xl">
        {vivo && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500"
          />
        )}
        <span className="min-w-0 break-words">{valor}</span>
      </p>
      <p className="break-words text-xs uppercase tracking-wide text-tinta-suave">
        {titulo}
      </p>
      {nota && <p className="mt-0.5 break-words text-xs text-tinta-suave">{nota}</p>}
    </div>
  );
}
