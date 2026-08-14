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
 * Cuánto se tumba el tablero al empezar y al acabar el recorrido, en grados.
 *
 * De 62° (casi a ras de mesa, dramático) a 38° (se ve la partida entera). Ese viaje ES
 * la cámara: la sensación de tridimensionalidad no la da el ángulo, la da que el
 * ángulo CAMBIE mientras miras.
 */
const INCLINACION_INICIAL = 62;
const INCLINACION_FINAL = 38;

/**
 * El momento de la portada: un tablero EN PERSPECTIVA donde se juega una partida al
 * ritmo de tu scroll.
 *
 * PARECE 3D SIN SERLO, y este es el truco entero: el tablero es un plano al que se le
 * aplica `rotateX`, y cada pieza —que es un SVG plano— lleva la rotación CONTRARIA,
 * así que se queda de pie sobre el tablero mirando a la cámara. Es la misma técnica que
 * usan los juegos con "billboards": nada es 3D, pero el cerebro lo lee como una mesa
 * con piezas encima. Con `translateZ` se levantan un poco del tablero y cada una tiene
 * su sombra en el suelo, que es lo que remata la ilusión.
 *
 * LA CÁMARA SE MUEVE CON EL SCROLL: el tablero se endereza de 62° a 38° mientras la
 * partida avanza. Un ángulo fijo se ve como una foto en diagonal; el que se mueve se
 * lee como una cámara. Eso, junto al scroll con inercia de `ScrollSuave`, es de donde
 * sale la sensación "de Apple" — no de la animación en sí.
 *
 * LAS PIEZAS SE DESLIZAN, NO PARPADEAN, y eso lo permite `prepararMiniatura`: cada
 * pieza tiene un id que le dura toda la partida, así que el navegador mueve SIEMPRE el
 * mismo elemento.
 *
 * TODO CON `transform`, que es lo único que el navegador mueve sin recalcular la
 * página: es la diferencia entre ir suave y ir a tirones en un móvil de gama media.
 *
 * SIN MOVIMIENTO SI EL SISTEMA LO PIDE: con `prefers-reduced-motion` el tablero se
 * enseña de frente, quieto y con la partida ya jugada — la información sin el
 * espectáculo.
 */
export function TableroMiniatura() {
  const seccion = useRef<HTMLDivElement>(null);
  const escena = useRef<HTMLDivElement>(null);
  const [jugada, setJugada] = useState(0);
  const quieto = useSyncExternalStore(suscribirPreferencia, leerPreferencia, enElServidor);

  const mini = useMemo(() => prepararMiniatura(PARTIDA_LEGAL), []);

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
    const plano = escena.current;
    if (!el || !plano || quieto) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // LA CÁMARA. Endereza el tablero mientras se scrollea: es lo que convierte una
      // imagen en perspectiva en una escena.
      gsap.fromTo(
        plano,
        { rotateX: INCLINACION_INICIAL, rotateZ: -8, scale: 0.92 },
        {
          rotateX: INCLINACION_FINAL,
          rotateZ: 0,
          scale: 1,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.6,
          },
        }
      );

      // LA PARTIDA. Se anima un NÚMERO y React pinta la posición; es el patrón de GSAP
      // para atar un valor al scroll. Con un tween el valor está definido siempre
      // —antes de empezar vale 0 y después del final el total— mientras que el
      // `onUpdate` de un ScrollTrigger pelado no dispara fuera de su rango y dejaba la
      // partida clavada en la última jugada vista.
      const avance = { jugada: 0 };
      gsap.to(avance, {
        jugada: mini.jugadas.length,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
        },
        onUpdate: () => setJugada(Math.round(avance.jugada)),
      });
    }, el);
    return () => ctx.revert();
  }, [mini.jugadas.length, quieto]);

  const jugadaVisible = quieto ? mini.jugadas.length : jugada;
  const { casillas: dondeEsta, comidas, sprites } = posicionEn(mini, jugadaVisible);
  const ultima = jugadaVisible > 0 ? mini.jugadas[jugadaVisible - 1] : null;

  return (
    <div ref={seccion} className="relative min-h-[280vh] bg-fondo">
      <div className="sticky top-0 flex min-h-screen items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {/* LA CÁMARA: la perspectiva vive en el PADRE, no en el tablero. Cuanto menor
              es el valor, más exagerada la fuga; 1400px es una lente larga, la que no
              deforma las piezas de los bordes. */}
          <div style={{ perspective: "1400px" }} className="py-6">
            <div
              ref={escena}
              className="relative mx-auto aspect-square w-full max-w-xl"
              style={{
                transformStyle: "preserve-3d",
                // Quieto: de frente y sin inclinar. Con movimiento, el ángulo inicial
                // lo pone GSAP en cuanto la sección entra.
                transform: quieto
                  ? "none"
                  : `rotateX(${INCLINACION_INICIAL}deg) rotateZ(-8deg) scale(0.92)`,
              }}
            >
              {/* El damero, con sombra propia para que se lea como una tabla con grosor
                  y no como un dibujo pegado al fondo. */}
              <div
                className="absolute inset-0 grid grid-cols-8 overflow-hidden rounded-lg"
                style={{ boxShadow: "0 40px 60px -20px rgba(0,0,0,0.45)" }}
              >
                {casillas.map((c) => (
                  <div key={c.i} style={{ backgroundColor: c.clara ? CLARA : OSCURA }} />
                ))}
              </div>

              {mini.piezas.map((p) => {
                const { x, y } = porcentajeDeCasilla(dondeEsta[p.id]);
                const comida = comidas.has(p.id);
                return (
                  <div
                    key={p.id}
                    style={{
                      position: "absolute",
                      width: "12.5%",
                      height: "12.5%",
                      transform: `translate(${x * 8}%, ${y * 8}%)`,
                      opacity: comida ? 0 : 1,
                      // Rebote mínimo al aterrizar: una pieza que se posa se lee como
                      // una pieza, una que llega recta se lee como un cursor.
                      transition: quieto
                        ? "none"
                        : "transform 480ms cubic-bezier(0.34, 1.4, 0.5, 1), opacity 300ms ease-out",
                      transformStyle: "preserve-3d",
                      willChange: "transform",
                    }}
                  >
                    {/* LA SOMBRA, tumbada en el tablero: es lo que ata la pieza al
                        suelo. Sin ella, las piezas parecen pegatinas flotando. */}
                    {!quieto && (
                      <div
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: "18%",
                          bottom: "6%",
                          width: "64%",
                          height: "26%",
                          borderRadius: "50%",
                          background:
                            "radial-gradient(ellipse at center, rgba(0,0,0,0.38), rgba(0,0,0,0) 70%)",
                        }}
                      />
                    )}
                    {/* LA PIEZA, DE PIE. La rotación contraria a la del tablero es todo
                        el truco: el SVG es plano, pero al deshacer la inclinación queda
                        mirando a la cámara, como una figura sobre la mesa. El
                        `translateZ` la levanta para que su sombra se vea debajo. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/piezas/${JUEGO}/${sprites[p.id]}.svg`}
                      alt=""
                      aria-hidden
                      style={{
                        width: "100%",
                        height: "100%",
                        transformOrigin: "bottom center",
                        transform: quieto
                          ? "none"
                          : `rotateX(-${INCLINACION_FINAL}deg) translateZ(6px)`,
                        filter: quieto ? "none" : "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
              París, 1750
            </p>
            <h2 className="text-3xl font-bold text-tinta">La partida de Légal</h2>
            <p className="text-sm text-tinta-suave">
              Siete jugadas, una dama regalada y mate. Baja para verla.
            </p>

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
                  {i % 2 === 0 && <span className="text-tinta-suave">{i / 2 + 1}.</span>}{" "}
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
    </div>
  );
}
