import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

const VARIANTES = {
  degradado: "bg-degradado-club text-sobre-acento hover:brightness-110",
  solido: "bg-acento-fuerte text-sobre-acento hover:brightness-110",
  secundario: "border border-borde bg-tarjeta text-tinta hover:bg-tarjeta-suave",
} as const;

type Variante = keyof typeof VARIANTES;

/**
 * Botón canónico de la app: mismas 3 variantes visuales (degradado/sólido/
 * secundario) tanto si se usa como `<button>` de formulario (submit por
 * defecto, como en el resto de la app), como enlace de navegación pasando
 * `href` (se renderiza como `next/link`), o como botón interactivo de un
 * Client Component pasando `onClick` (Task 6, editor en vivo): en ese caso
 * el tipo por defecto pasa a "button" para no disparar un submit accidental
 * si en algún momento queda anidado dentro de un `<form>`.
 */
export function Boton({
  variante = "solido", className = "", children, href, onClick, type, disabled,
}: {
  variante?: Variante;
  className?: string;
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base = `rounded-xl p-3 font-semibold transition duration-100 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${VARIANTES[variante]}`;
  if (href) {
    return (
      <Link href={href} className={`${base} inline-flex items-center justify-center text-center ${className}`.trim()}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type ?? (onClick ? "button" : "submit")}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
