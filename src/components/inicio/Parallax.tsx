"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Parallax suave: lo de dentro se mueve un poco más despacio que la página.
 *
 * POCO Y CON RECORTE. El recorrido es de treinta píxeles y el contenido va dentro de un
 * contenedor con `overflow-hidden`, así que la imagen nunca se despega de su marco ni
 * deja una franja vacía. Los parallax que se notan son los que están mal hechos: este
 * solo tiene que dar la sensación de profundidad al pasar.
 *
 * Igual que `Revelar`: el contenido está en su sitio sin JavaScript, y con
 * `prefers-reduced-motion` no se mueve nada.
 */
export function Parallax({
  children,
  className,
  recorrido = 30,
}: {
  children: React.ReactNode;
  className?: string;
  /** Píxeles que se desplaza en total a lo largo de todo el paso por pantalla. */
  recorrido?: number;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const dentro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caja = marco.current;
    const hijo = dentro.current;
    if (!caja || !hijo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        hijo,
        { y: -recorrido / 2 },
        {
          y: recorrido / 2,
          ease: "none", // Ligado al scroll: cualquier curva aquí se siente como un tirón.
          scrollTrigger: {
            trigger: caja,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        }
      );
    }, caja);
    return () => ctx.revert();
  }, [recorrido]);

  return (
    <div ref={marco} className={`overflow-hidden ${className ?? ""}`}>
      <div ref={dentro}>{children}</div>
    </div>
  );
}
