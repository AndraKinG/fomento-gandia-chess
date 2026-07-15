import Link from "next/link";
import type { ReactNode } from "react";

const VARIANTES = {
  degradado: "bg-degradado-club text-sobre-acento hover:brightness-110",
  solido: "bg-acento-fuerte text-sobre-acento hover:brightness-110",
  secundario: "border border-borde bg-tarjeta text-tinta hover:bg-tarjeta-suave",
} as const;

type Variante = keyof typeof VARIANTES;

/**
 * Botón canónico de la app: mismas 3 variantes visuales (degradado/sólido/
 * secundario) tanto si se usa como `<button>` de formulario (submit por
 * defecto, como en el resto de la app) o como enlace de navegación pasando
 * `href` (se renderiza como `next/link`).
 */
export function Boton({
  variante = "solido", className = "", children, href,
}: {
  variante?: Variante;
  className?: string;
  children: ReactNode;
  href?: string;
}) {
  const base = `rounded-xl p-3 font-semibold transition duration-100 active:scale-[0.97] ${VARIANTES[variante]}`;
  if (href) {
    return (
      <Link href={href} className={`${base} inline-flex items-center justify-center text-center ${className}`.trim()}>
        {children}
      </Link>
    );
  }
  return <button className={`${base} ${className}`.trim()}>{children}</button>;
}
