export function ChipElo({ valor, etiqueta = "ELO" }: { valor: number | null; etiqueta?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-fuerte ring-1 ring-borde-acento dark:text-acento">
      {etiqueta} {valor ?? "—"}
    </span>
  );
}
