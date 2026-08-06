/**
 * Estado vacío de una pantalla.
 *
 * El texto va limitado a una medida legible aunque el contenedor sea ancho. En las
 * pantallas de tipo `panel` (hasta 1152 px) la explicación se estiraba a todo lo ancho
 * y quedaba una línea larguísima centrada en medio de un hueco enorme.
 */
export function EstadoVacio({
  icono = "♞",
  titulo,
  detalle,
}: {
  icono?: string;
  titulo: string;
  detalle?: string;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-10 text-center">
      <span aria-hidden className="text-4xl opacity-40">
        {icono}
      </span>
      <p className="font-semibold text-tinta">{titulo}</p>
      {detalle && <p className="text-sm text-tinta-suave">{detalle}</p>}
    </div>
  );
}
