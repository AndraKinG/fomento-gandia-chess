import Image from "next/image";

/**
 * Escudo del club.
 *
 * DOS VERSIONES A PROPÓSITO, y no es capricho:
 *
 * - `completo` (`/escudo.png`) es el escudo con el aro y el nombre del club.
 *   Medido sobre la propia imagen: el aro solo se lee de 96 px para arriba. Va en
 *   login, registro y la web pública, donde hay sitio.
 * - `marca` (`/marca.png`) es la escena del centro sin el texto, que se reconoce
 *   desde 32 px. Va en la barra lateral y en la cabecera del móvil, donde además el
 *   nombre del club ya está escrito al lado y repetirlo dentro del escudo sobra.
 *
 * Los dos salen del mismo original con `scripts/generar-iconos.mjs`.
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
  /** Lado en píxeles. Hace falta explícito para que el navegador reserve el hueco
   *  y no salte el layout al cargar. */
  lado: number;
  className?: string;
  alt?: string;
  /** true solo en el escudo grande de login: es la imagen principal de la pantalla. */
  priority?: boolean;
}) {
  return (
    <Image
      src={version === "completo" ? "/escudo.png" : "/marca.png"}
      width={lado}
      height={lado}
      alt={alt}
      priority={priority}
      className={className}
    />
  );
}
