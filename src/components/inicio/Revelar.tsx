"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Aparecer al llegar: un fundido con veinte píxeles de subida.
 *
 * EL CONTENIDO ESTÁ VISIBLE POR DEFECTO y solo se esconde si la animación va a correr
 * de verdad. Es al revés de como se hace normalmente (CSS que esconde y JS que
 * enseña), y el motivo es que esto es la portada PÚBLICA: si el JavaScript no carga,
 * si tarda, o si un buscador la lee sin ejecutar nada, la página tiene que verse
 * entera igual. Escondiendo desde CSS, un fallo de GSAP deja la web en blanco.
 *
 * SE RESPETA `prefers-reduced-motion`: quien lo tenga puesto ve la página quieta, que
 * es exactamente lo que ha pedido su sistema. No es un detalle de accesibilidad de
 * adorno — hay gente a la que el movimiento le marea de verdad.
 *
 * `once: true`: se revela y se acabó. Volver a esconderlo al subir convierte el scroll
 * en un parpadeo, que es el error clásico de estas animaciones.
 */
export function Revelar({
  children,
  className,
  id,
  retraso = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Para poder enlazar a la sección con un ancla (`#unirse`), como antes. */
  id?: string;
  /** Segundos de espera. Para escalonar hermanos sin montar una línea de tiempo. */
  retraso?: number;
}) {
  const caja = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          delay: retraso,
          // `immediateRender: false` ES LO QUE SALVA LA PÁGINA, y costó verlo: sin
          // esto, `fromTo` aplica el `opacity: 0` EN CUANTO SE CREA el tween, no
          // cuando llega el scroll. Si la animación no llega a correr —el ticker de
          // GSAP va con `requestAnimationFrame`, y una pestaña que no compone no
          // tiene rAF— el contenido se queda invisible para siempre. Se vio aquí:
          // tres de las cuatro secciones de la portada, en blanco.
          //
          // Con esto, el estado inicial se aplica cuando el tween arranca, así que
          // lo peor que puede pasar es que la sección se vea sin animar.
          immediateRender: false,
          // `power2.out`: arranca rápido y frena al final. Es la curva que hace que
          // algo parezca que "llega" en vez de que se encienda.
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [retraso]);

  // `section` y no `div`: estas son las secciones de la portada, y cambiarlas a `div`
  // al meter la animación le quitaría a un lector de pantalla el índice de la página.
  return (
    <section ref={caja} id={id} className={className}>
      {children}
    </section>
  );
}
