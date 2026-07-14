export function Tarjeta({
  children, destacada = false, className = "",
}: { children: React.ReactNode; destacada?: boolean; className?: string }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${
      destacada
        ? "border-borde-acento bg-tarjeta-suave"
        : "border-borde bg-tarjeta"
    } ${className}`}>
      {children}
    </div>
  );
}
