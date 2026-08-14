"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { porcentajeDeCasilla, prepararMiniatura } from "@/lib/inicio/miniatura";

function suscribirPreferencia(avisar: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}
function leerPreferencia(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function enElServidor(): boolean {
  return false;
}

const JUEGO = "celtic";
/** Muy tumbado: es un fondo, no un tablero para jugar. Se mira desde la mesa. */
const INCLINACION = 68;

/**
 * Cuánto desenfoca cada fila según lo lejos que esté.
 *
 * ESTA ES LA PIEZA QUE DA EL REALISMO, más que la perspectiva: una cámara real no tiene
 * todo enfocado a la vez. Con las filas del fondo desenfocadas, el cerebro deja de leer
 * "dibujo en diagonal" y lee "foto de una mesa". Es el mismo truco de las maquetas que
 * parecen reales en las fotos.
 *
 * OJO CON LA ESCALA: en la posición inicial SOLO hay piezas en las filas 1, 2, 7 y 8.
 * Una escala repartida entre las ocho filas dejaba únicamente dos valores en pantalla
 * (nítido y muy borroso) y el fondo se veía como un recorte pegado, no como fondo. Los
 * saltos están puestos donde de verdad hay piezas.
 */
function desenfoqueDeFila(casilla: string): number {
  const fila = Number(casilla[1]); // 1..8
  if (fila === 8) return 3.2; // las de atrás del todo, casi manchas de color
  if (fila === 7) return 1.9;
  if (fila === 6) return 1.3;
  if (fila === 5) return 0.9;
  if (fila === 4) return 0.6;
  if (fila === 3) return 0.35;
  if (fila === 2) return 0.15; // un pelo, para que no compitan con el título
  return 0;
}

/**
 * El tablero del fondo del hero: una mesa vista casi a ras, con luz y profundidad.
 *
 * QUÉ LO HACE PARECER REAL, por orden de importancia:
 *
 * 1. **Profundidad de campo.** Las filas del fondo van desenfocadas (`desenfoqueDeFila`).
 *    Sin esto es un dibujo; con esto es una foto.
 * 2. **Luz.** Un foco radial sobre el tablero y un degradado que apaga el fondo: la luz
 *    es lo que más cuesta falsificar y lo que más se nota cuando está.
 * 3. **Las piezas de pie** con su sombra, la misma técnica que en la sección de la
 *    partida: el plano se inclina y la pieza lleva la rotación contraria.
 * 4. **El ratón mueve la cámara** en escritorio, poquísimo (dos grados). Es lo que hace
 *    que la escena se sienta un objeto y no una imagen — y en cuanto pasa de ahí, marea.
 *
 * ES DECORADO: `aria-hidden` entero. Quien navega con lector de pantalla no se pierde
 * nada, porque el contenido de verdad va encima en su propio bloque.
 */
export function EscenaHero() {
  const escena = useRef<HTMLDivElement>(null);
  const quieto = useSyncExternalStore(suscribirPreferencia, leerPreferencia, enElServidor);

  // La posición inicial: se reconoce como ajedrez de un vistazo, y las 32 piezas llenan
  // el tablero, que es lo que hace bonito un fondo.
  const mini = prepararMiniatura([]);

  useEffect(() => {
    const el = escena.current;
    if (!el || quieto) return;
    // Sin ratón (móvil, tablet) no hay nada que seguir: el `hover: hover` evita además
    // que un táctil dispare esto con un toque.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    // `quickTo` en vez de un tween nuevo por cada movimiento del ratón: crea uno solo y
    // le cambia el destino. Con un tween por evento se acumulan cientos por segundo.
    const girarY = gsap.quickTo(el, "rotateY", { duration: 0.9, ease: "power3.out" });
    const girarX = gsap.quickTo(el, "rotateX", { duration: 0.9, ease: "power3.out" });

    const alMover = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      // Dos grados de recorrido. Parece poco escrito y es justo lo que se nota.
      girarY(x * 4);
      girarX(INCLINACION - y * 2);
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    return () => window.removeEventListener("pointermove", alMover);
  }, [quieto]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* La cámara. La escena se va al fondo y hacia abajo: se ve la mesa, no el
          tablero entero, que es como se ve una mesa de verdad al sentarte. */}
      <div
        className="absolute left-1/2 top-[42%] h-[130vmin] w-[130vmin] -translate-x-1/2"
        style={{ perspective: "1100px" }}
      >
        <div
          ref={escena}
          className="relative h-full w-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${INCLINACION}deg)`,
            transformOrigin: "center 30%",
          }}
        >
          <div className="absolute inset-0 grid grid-cols-8">
            {Array.from({ length: 64 }, (_, i) => {
              const fila = Math.floor(i / 8);
              const columna = i % 8;
              const clara = (fila + columna) % 2 === 0;
              return (
                <div
                  key={i}
                  style={{
                    // Las casillas del fondo se apagan: es la niebla de distancia, y sin
                    // ella el tablero parece un mantel de cuadros hasta el horizonte.
                    backgroundColor: clara ? "#dfeaf6" : "#5d8cb8",
                    opacity: 0.28 + (fila / 7) * 0.5,
                    filter: fila < 3 ? `blur(${(3 - fila) * 0.8}px)` : "none",
                  }}
                />
              );
            })}
          </div>

          {mini.piezas.map((p) => {
            const { x, y } = porcentajeDeCasilla(p.casilla);
            const desenfoque = desenfoqueDeFila(p.casilla);
            const fila = Number(p.casilla[1]);
            return (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  width: "12.5%",
                  height: "12.5%",
                  transform: `translate(${x * 8}%, ${y * 8}%)`,
                  transformStyle: "preserve-3d",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "20%",
                    bottom: "8%",
                    width: "60%",
                    height: "24%",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(ellipse at center, rgba(0,0,0,0.45), rgba(0,0,0,0) 70%)",
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/piezas/${JUEGO}/${p.sprite}.svg`}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    transformOrigin: "bottom center",
                    transform: `rotateX(-${INCLINACION}deg) translateZ(4px)`,
                    // Las de atrás, más borrosas y más apagadas: profundidad de campo y
                    // niebla, las dos cosas que hacen que una escena tenga fondo.
                    filter: `blur(${desenfoque}px) drop-shadow(0 3px 4px rgba(0,0,0,0.5))`,
                    opacity: 0.35 + ((8 - fila) / 7) * 0.6,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* EL FOCO. Una luz cálida arriba y oscuridad en los bordes: es lo que convierte
          un tablero iluminado plano en una mesa de club con una lámpara encima. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 12%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)",
        }}
      />
      {/* La viñeta que funde la escena con la cabecera y deja legible el texto. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,31,51,0.92) 0%, rgba(11,31,51,0.55) 45%, rgba(11,31,51,0.9) 100%)",
        }}
      />
    </div>
  );
}
