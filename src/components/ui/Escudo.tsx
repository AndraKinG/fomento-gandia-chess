import Image from "next/image";

/** Proporción del recorte centrado del logo (860x576): hace falta para reservar
 *  el hueco exacto y que el layout no salte al cargar. */
const PROPORCION = 860 / 576;

/**
 * La imagen de marca del club — desde el 2026-08-11, el LOGO OFICIAL: el Puente
 * del Fomento de Gandia construido con piezas de ajedrez (sustituyó al escudo
 * redondo que habíamos generado nosotros, por decisión del propietario).
 *
 * DOS VERSIONES A PROPÓSITO, y no es capricho:
 *
 * - `completo` (`/logo-club-centrado.jpg`) es el ENCUADRE CENTRADO del mural —
 *   el puente con los dos rótulos, pedido así por el propietario. Va en login,
 *   registro y la web pública. `lado` es su ALTO; el ancho sale de la proporción
 *   real para que no se deforme. El original entero queda en `/logo-club.jpg`
 *   como master del que el script genera los recortes.
 * - `marca` (`/marca.png`) es el caballo del mural en un disco con el aro marino
 *   de la casa — lo único del mural que se reconoce a 32 px. Va en la barra
 *   lateral y en la cabecera del móvil, donde además el nombre del club ya está
 *   escrito al lado.
 *
 * La marca y los iconos de la PWA salen de `scripts/generar-iconos.mjs`.
 *
 * `alt=""` cuando es decorativo: en la barra lateral y en login el nombre del club
 * está en el texto de al lado, así que un lector de pantalla que lo leyera otra vez
 * solo estaría repitiendo.
 */
export function Escudo({
  version = "marca",
  lado,
  className = "",
  alt = "",
  priority = false,
}: {
  version?: "completo" | "marca";
  /** Alto en píxeles (la marca es cuadrada; el completo es rectangular y el ancho
   *  sale de la proporción). Explícito para que el navegador reserve el hueco. */
  lado: number;
  className?: string;
  alt?: string;
  /** true solo en el escudo grande de login: es la imagen principal de la pantalla. */
  priority?: boolean;
}) {
  const completo = version === "completo";
  return (
    <Image
      src={completo ? "/logo-club-centrado.jpg" : "/marca.png"}
      width={completo ? Math.round(lado * PROPORCION) : lado}
      height={lado}
      alt={alt}
      priority={priority}
      className={`${completo ? "rounded-xl" : ""} ${className}`.trim()}
    />
  );
}
