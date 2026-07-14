const ESTILOS = {
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  error: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  aviso: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
} as const;

export function Banner({
  tipo, children,
}: { tipo: keyof typeof ESTILOS; children: React.ReactNode }) {
  return (
    <div role="alert" className={`rounded-xl border p-3 text-sm ${ESTILOS[tipo]}`}>
      {children}
    </div>
  );
}
