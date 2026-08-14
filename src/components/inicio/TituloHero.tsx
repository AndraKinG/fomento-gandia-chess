"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * El título del hero, entrando por líneas desde detrás de una máscara.
 *
 * EL TRUCO ES LA MÁSCARA, no el movimiento: cada línea vive dentro de una caja con
 * `overflow: hidden`, así que al subir desde abajo parece que **asoma por detrás de un
 * borde** en vez de deslizarse por la pantalla. Es lo que hace que un texto entre
 * "caro"; sin la máscara es un `fade` más.
 *
 * ES EL PRIMER GOLPE DE VISTA de la web, así que no espera al scroll: arranca solo, con
 * las líneas escalonadas y el resto detrás.
 *
 * EL TEXTO ESTÁ EN EL HTML de siempre y visible: si el JavaScript no llega, se lee la
 * portada entera. La animación solo esconde lo que va a mover, y solo cuando de verdad
 * va a moverlo (`immediateRender: false` no hace falta aquí porque el `set` va dentro
 * del mismo `useEffect` que lanza la animación, no atado a un scroll que puede no
 * llegar nunca).
 */
export function TituloHero({ children }: { children: React.ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const lineas = gsap.utils.toArray<HTMLElement>("[data-linea]");
      if (lineas.length === 0) return;
      gsap
        .timeline()
        .set(lineas, { yPercent: 115, opacity: 0 })
        .to(lineas, {
          yPercent: 0,
          opacity: 1,
          duration: 1,
          // `expo.out` frena muy al final: es la curva que hace que algo "aterrice"
          // en vez de pararse. Es la diferencia entre elegante y mecánico.
          ease: "expo.out",
          stagger: 0.12,
        });
    }, el);
    return () => ctx.revert();
  }, []);

  return <div ref={caja}>{children}</div>;
}

/** Una línea del título: la caja recorta y el hijo es lo que sube. */
export function Linea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className="block overflow-hidden">
      <span data-linea className={`block ${className ?? ""}`}>
        {children}
      </span>
    </span>
  );
}
