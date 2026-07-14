export function EstadoVacio({
  icono = "♞", titulo, detalle,
}: { icono?: string; titulo: string; detalle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span aria-hidden className="text-4xl opacity-40">{icono}</span>
      <p className="font-semibold text-tinta">{titulo}</p>
      {detalle && <p className="text-sm text-tinta-suave">{detalle}</p>}
    </div>
  );
}
