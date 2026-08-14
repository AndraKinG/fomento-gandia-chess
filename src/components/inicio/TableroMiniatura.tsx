"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  PARTIDA_LEGAL,
  porcentajeDeCasilla,
  posicionEn,
  prepararMiniatura,
} from "@/lib/inicio/miniatura";

/**
 * `prefers-reduced-motion`, leído como una fuente externa.
 *
 * Con `useSyncExternalStore` y no con un efecto que llame a `setState`: el lint del
 * compilador de React prohíbe lo segundo, y con razón — un `setState` en el cuerpo de
 * un efecto es un segundo pintado garantizado. Y de paso esto reacciona si el sistema
 * cambia la preferencia con la página abierta.
 */
function suscribirPreferencia(avisar: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}
function leerPreferencia(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
/** En el servidor se asume que sí hay movimiento: es lo que ve la mayoría, y el
 *  cliente corrige en la hidratación si hace falta. */
function enElServidor(): boolean {
  return false;
}

/** El tema del club, el mismo que ve un socio dentro de la app. */
const CLARA = "#e9f2fb";
const OSCURA = "#6b9dc9";
/** Las piezas de siempre, las que salen por defecto en la app. */
const JUEGO = "celtic";

/**
 * El momento de la portada: un tablero que juega una partida al ritmo de tu scroll.
 *
 * CÓMO SE MUEVE: la sección es alta y el tablero se queda quieto dentro con `position:
 * sticky`; el avance del scroll manda sobre qué jugada se ve. No es un vídeo ni un
 * bucle: si subes, la partida va hacia atrás. Esa es la diferencia entre una animación
 * que responde y una que se limita a ocurrir, y es lo que hace que se sienta fluida.
 *
 * EL ANCLADO ES `sticky` DE CSS, NO EL `pin` DE SCROLLTRIGGER, y no es un capricho: el
 * `pin` envuelve el elemento en un `pin-spacer` —o sea, LO MUEVE DE SITIO EN EL DOM— y
 * React deja de encontrar sus nodos. Se vio al primer intento, con la consola llena de
 * "insertBefore ... is not a child of this node" y la sección medio pintada. `sticky`
 * hace lo mismo a la vista, sin tocar el árbol, y en un móvil va mejor.
 *
 * LAS PIEZAS SE DESLIZAN, NO PARPADEAN, y eso lo permite `prepararMiniatura`: cada
 * pieza tiene un id que le dura toda la partida, así que el navegador mueve SIEMPRE el
 * mismo elemento. Pintando la posición de cero en cada jugada se vería un pestañeo.
 *
 * SE ANIMA CON `transform`, no con `left`/`top`: es lo único que el navegador puede
 * mover sin recalcular la página entera, y es la diferencia entre ir suave y ir a
 * tirones en un móvil de gama media.
 *
 * SIN MOVIMIENTO SI EL SISTEMA LO PIDE: con `prefers-reduced-motion` no se ancla nada
 * ni se anima nada — se enseña la posición final y las jugadas escritas, que es la
 * información, sin el espectáculo.
 */
export function TableroMiniatura() {
  const seccion = useRef<HTMLDivElement>(null);
  const tablero = useRef<HTMLDivElement>(null);
  const [jugada, setJugada] = useState(0);
  const quieto = useSyncExternalStore(suscribirPreferencia, leerPreferencia, enElServidor);

  const mini = useMemo(() => prepararMiniatura(PARTIDA_LEGAL), []);

  // Las 64 casillas, calculadas una vez: son puro adorno y no dependen de nada.
  const casillas = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const fila = Math.floor(i / 8);
        const columna = i % 8;
        return { i, clara: (fila + columna) % 2 === 0 };
      }),
    []
  );

  useEffect(() => {
    const el = seccion.current;
    const caja = tablero.current;
    if (!el || !caja) return;

    // Sin animación no se ancla nada: la posición que se enseña la decide
    // `jugadaVisible` más abajo, sin tocar estado desde aquí.
    if (quieto) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // SE ANIMA UN NÚMERO, no el DOM: GSAP lleva `avance.jugada` de 0 al total al
      // ritmo del scroll y en cada paso se lo cuenta a React, que pinta la posición.
      //
      // Es el patrón normal de GSAP para "atar un valor al scroll", y se llegó a él
      // después de probar con un ScrollTrigger pelado y su `onUpdate`: aquello se
      // quedaba clavado en la última jugada vista al salir de la sección —fuera de su
      // rango `onUpdate` no dispara— y había que parchearlo con `onLeave` y
      // `onLeaveBack`. Con un tween el valor está definido SIEMPRE: antes de empezar
      // vale 0 y después del final vale el total, sin casos aparte.
      const avance = { jugada: 0 };
      gsap.to(avance, {
        jugada: mini.jugadas.length,
        ease: "none", // Atado al scroll: cualquier curva aquí se nota como un tirón.
        scrollTrigger: {
          trigger: el,
          // Desde que la sección llena la pantalla hasta que acaba de pasar. Su alto
          // (en las clases, más abajo) es lo que decide cuánto scroll dura la partida.
          start: "top top",
          end: "bottom bottom",
          // Medio segundo de inercia: suaviza el scroll de rueda, que va a saltos.
          scrub: 0.5,
        },
        onUpdate: () => setJugada(Math.round(avance.jugada)),
      });
    }, el);
    return () => ctx.revert();
  }, [mini.jugadas.length, quieto]);

  // Quieto = la partida entera, ya jugada: la información sin el espectáculo.
  const jugadaVisible = quieto ? mini.jugadas.length : jugada;
  const { casillas: dondeEsta, comidas, sprites } = posicionEn(mini, jugadaVisible);
  const ultima = jugadaVisible > 0 ? mini.jugadas[jugadaVisible - 1] : null;

  return (
    // Alta a propósito: son las pantallas de scroll que dura la partida. Con trece
    // medias jugadas, dos pantallas y media dan tiempo a seguirla sin aburrir.
    <div ref={seccion} className="relative min-h-[250vh] bg-fondo">
      {/* Quieto mientras la sección pasa. `top-16` deja respirar por arriba. */}
      <div className="sticky top-16 mx-auto grid max-w-5xl items-center gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          ref={tablero}
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-borde shadow-sm"
        >
          {/* El damero, en una rejilla normal. Detrás de las piezas y sin tocar. */}
          <div className="absolute inset-0 grid grid-cols-8">
            {casillas.map((c) => (
              <div key={c.i} style={{ backgroundColor: c.clara ? CLARA : OSCURA }} />
            ))}
          </div>

          {mini.piezas.map((p) => {
            const { x, y } = porcentajeDeCasilla(dondeEsta[p.id]);
            const comida = comidas.has(p.id);
            return (
              /* Son 12 SVG estáticos de 4 KB que se mueven con `transform` treinta
                 veces por partida: `next/image` no optimiza SVG y su envoltorio
                 estorbaría al posicionamiento absoluto sin ganar un byte. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={`/piezas/${JUEGO}/${sprites[p.id]}.svg`}
                alt=""
                aria-hidden
                // `xPercent`/`yPercent` de GSAP en versión CSS: la pieza mide un octavo
                // del tablero, así que moverla el 100% de su ancho es moverla una
                // casilla. Y con `transform` en vez de `left`, el navegador no
                // recalcula la página en cada jugada.
                style={{
                  position: "absolute",
                  width: "12.5%",
                  height: "12.5%",
                  transform: `translate(${x * 8}%, ${y * 8}%)`,
                  opacity: comida ? 0 : 1,
                  transition: quieto
                    ? "none"
                    : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out",
                  willChange: "transform",
                }}
              />
            );
          })}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            París, 1750
          </p>
          <h2 className="text-2xl font-bold text-tinta">La partida de Légal</h2>
          <p className="text-sm text-tinta-suave">
            Siete jugadas, una dama regalada y mate. Baja para verla.
          </p>

          {/* Las jugadas escritas: además de acompañar, es lo que deja esta sección
              con sentido para quien no ve la animación. */}
          <ol className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm">
            {mini.jugadas.map((j, i) => (
              <li
                key={`${j.san}-${i}`}
                className={
                  i < jugadaVisible
                    ? "font-semibold text-tinta"
                    : "text-tinta-suave opacity-40"
                }
              >
                {i % 2 === 0 && (
                  <span className="text-tinta-suave">{i / 2 + 1}.</span>
                )}{" "}
                {j.san}
              </li>
            ))}
          </ol>

          <p className="min-h-6 text-sm text-tinta-suave" aria-live="polite">
            {ultima?.san === "Nd5#"
              ? "Mate. Y con la dama en el bolsillo del rival."
              : ultima?.san === "Bxd1"
                ? "Negras se comen la dama. Ahí está la trampa."
                : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
