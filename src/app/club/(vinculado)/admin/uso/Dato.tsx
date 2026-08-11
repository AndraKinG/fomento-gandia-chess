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
    <div className="rounded-2xl border border-borde bg-tarjeta p-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-tinta">
        {vivo && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500"
          />
        )}
        {valor}
      </p>
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{titulo}</p>
      {nota && <p className="mt-0.5 text-xs text-tinta-suave">{nota}</p>}
    </div>
  );
}
