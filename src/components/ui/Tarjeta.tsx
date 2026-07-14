export function Tarjeta({
  children, destacada = false, compacta = false, className = "",
}: {
  children: React.ReactNode;
  destacada?: boolean;
  compacta?: boolean;
  // Solo utilidades de LAYOUT (flex/gap/margin, etc.): el orden de las clases
  // base ya fija el resto (padding, borde, fondo...), así que cualquier
  // utilidad de esas categorías puesta aquí puede perder el empate de
  // especificidad CSS y no tener efecto.
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border shadow-sm ${compacta ? "p-3" : "p-4"} ${
      destacada
        ? "border-borde-acento bg-tarjeta-suave"
        : "border-borde bg-tarjeta"
    } ${className}`}>
      {children}
    </div>
  );
}
