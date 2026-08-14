"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Scroll con inercia (Lenis) en la portada pública.
 *
 * ES LO QUE MÁS SE NOTA de todo esto, y no es una animación: el scroll del navegador
 * va a saltos discretos —cada muesca de la rueda es un brinco— y eso es lo que hace
 * que una web parezca "de plantilla" por muy bien animada que esté. Lenis interpola
 * entre esos saltos con física, y de golpe todo lo que va atado al scroll se mueve
 * suave. Es el truco de las webs premiadas, más que cualquier efecto concreto.
 *
 * SOLO EN LA WEB PÚBLICA. Dentro de /club hay tableros, relojes que corren y listas
 * largas: ahí un scroll con inercia estorba más que ayuda, y en una partida a 3+2
 * sería directamente molesto.
 *
 * SE APAGA CON `prefers-reduced-motion`: quien lo tiene puesto quiere el scroll de su
 * sistema, no uno inventado. Y quien no tenga JavaScript sigue teniendo el de siempre,
 * porque esto no toca el HTML.
 *
 * EL RELOJ ES EL DE GSAP, no el `requestAnimationFrame` de Lenis: dos bucles de
 * animación compitiendo es la receta del micro-tirón, así que Lenis se engancha al
 * ticker de GSAP y ScrollTrigger se entera de cada movimiento. Esta es la parte que
 * hay que copiar bien o el scroll suave y las animaciones se desincronizan.
 */
export function ScrollSuave() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({
      // Un pelín más largo que el de por defecto: se nota "caro" sin llegar a dar la
      // sensación de que la página va con retraso, que es el error típico.
      duration: 1.1,
      // Solo la rueda y el táctil. El teclado y los saltos a un ancla se dejan al
      // navegador: interceptarlos rompe la accesibilidad para ganar un efecto.
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (tiempo: number) => lenis.raf(tiempo * 1000);
    gsap.ticker.add(tick);
    // GSAP suaviza los saltos de tiempo entre fotogramas; con Lenis eso se traduce en
    // un arrastre raro al volver a una pestaña, así que se desactiva.
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
