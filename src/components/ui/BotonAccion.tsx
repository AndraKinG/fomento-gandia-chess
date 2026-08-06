"use client";

import { useFormStatus } from "react-dom";
import { Boton } from "@/components/ui/Boton";

/**
 * Botón de envío que se deshabilita y cambia de texto mientras la acción corre.
 *
 * POR QUÉ EXISTE: las acciones de servidor en un `<form action={...}>` de un
 * Server Component no dan ninguna señal por sí solas. Con acciones que tardan
 * —actualizar el ELO son decenas de peticiones a webs externas— la pantalla
 * parecía congelada: el usuario pulsaba, no pasaba nada visible, volvía a pulsar
 * y acababa recargando.
 *
 * `useFormStatus` lee el estado del formulario padre, así que basta con envolver
 * el botón: no hace falta convertir la página entera en Client Component.
 */
export function BotonAccion({
  children,
  trabajando = "Trabajando…",
  variante = "degradado",
  className = "",
}: {
  children: React.ReactNode;
  /** Texto mientras la acción está en marcha. */
  trabajando?: string;
  variante?: "degradado" | "solido" | "secundario";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Boton variante={variante} type="submit" disabled={pending} className={className}>
      {pending ? trabajando : children}
    </Boton>
  );
}
