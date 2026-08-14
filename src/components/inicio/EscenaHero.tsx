"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { proyectar } from "@/lib/inicio/proyeccion";

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

/** Las piezas de una fila de fondo, en orden de columna. */
const FILA_DE_PIEZAS = ["R", "N", "B", "Q", "K", "B", "N", "R"];

/**
 * Cuánto desenfoca cada fila. Es lo que convierte un dibujo en una foto: una cámara real
 * no tiene todo enfocado a la vez, y en cuanto el fondo pierde nitidez el cerebro deja
 * de leer "diagonal" y lee "profundidad".
 */
function desenfoqueDeFila(fila: number): number {
  return Math.max(0, (fila - 1) * 0.55);
}

/**
 * El tablero del fondo del hero: una mesa vista desde una silla, con luz y profundidad.
 *
 * LA PERSPECTIVA ESTÁ CALCULADA, NO DELEGADA AL NAVEGADOR (`lib/inicio/proyeccion.ts`,
 * con tests). La primera versión inclinaba un plano con `rotateX` y contrarrestaba cada
 * pieza dentro de un `preserve-3d`; sobre el papel es lo correcto —y en la sección de la
 * partida funciona— pero aquí salió con la profundidad INVERTIDA cuatro veces seguidas:
 * la fila del fondo llegó a pintarse seis veces más grande que la de delante, y solo se
 * detectaba midiendo píxeles en pantalla. Ahora la distancia es una cuenta que se prueba
 * sin abrir el navegador.
 *
 * QUÉ LA HACE PARECER REAL, por orden de importancia:
 *   1. **Profundidad de campo**: las filas del fondo, desenfocadas.
 *   2. **Luz**: foco radial arriba y viñeta que apaga los bordes.
 *   3. **Coherencia**: tamaño, separación y altura en pantalla cuentan lo mismo.
 *   4. **Movimiento lento**: entra al cargar y deriva, muy despacio.
 *
 * ES DECORADO: `aria-hidden` entero, y el contenido de verdad va encima en su bloque.
 */
export function EscenaHero() {
  const escena = useRef<HTMLDivElement>(null);
  const quieto = useSyncExternalStore(suscribirPreferencia, leerPreferencia, enElServidor);

  // Las cuatro filas con piezas de la posición inicial, ya proyectadas. Las filas
  // vacías no se pintan: son 32 elementos en vez de 64 casillas más 32 piezas.
  const piezas = useMemo(() => {
    const filas: { fila: number; color: string; tipos: string[] }[] = [
      { fila: 8, color: "b", tipos: FILA_DE_PIEZAS },
      { fila: 7, color: "b", tipos: Array(8).fill("P") },
      { fila: 2, color: "w", tipos: Array(8).fill("P") },
      { fila: 1, color: "w", tipos: FILA_DE_PIEZAS },
    ];
    return filas.flatMap(({ fila, color, tipos }) =>
      tipos.map((tipo, columna) => {
        const p = proyectar(columna, fila);
        return {
          id: `${color}${tipo}-${fila}-${columna}`,
          sprite: `${color}${tipo}`,
          x: p.x,
          y: p.y,
          escala: p.escala,
          fila,
        };
      })
    );
  }, []);

  useEffect(() => {
    const el = escena.current;
    if (!el || quieto) return;

    // LA ESCENA ENTRA Y NO SE QUEDA QUIETA. Sin esto el hero es una foto: se ve bien y
    // no pasa nada, que es exactamente lo que dijo el propietario al verlo. Va ANTES del
    // guardián del ratón para que también ocurra en un móvil, que es donde lo va a ver
    // la mayor parte del club.
    gsap.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.6, ease: "power3.out" });
    // Deriva de cámara: catorce segundos de ida y otros tantos de vuelta. No se mira, se
    // siente; es lo que separa "una imagen" de "una escena".
    const deriva = gsap.to(el, {
      xPercent: 1.2,
      duration: 14,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });

    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return () => deriva.kill();
    }

    // `quickTo` crea UN tween y le cambia el destino; uno por evento serían cientos por
    // segundo. Dos puntos porcentuales de recorrido: escrito parece nada y es justo lo
    // que se nota sin marear.
    const mover = gsap.quickTo(el, "xPercent", { duration: 1.1, ease: "power3.out" });
    const alMover = (e: PointerEvent) => mover((e.clientX / window.innerWidth - 0.5) * 4);
    window.addEventListener("pointermove", alMover, { passive: true });
    return () => {
      window.removeEventListener("pointermove", alMover);
      deriva.kill();
    };
  }, [quieto]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={escena} className="absolute inset-0">
        {/* EL SUELO: un trapecio que se estrecha hacia el fondo. Con `clip-path` y no con
            una rotación 3D, por el mismo motivo que las piezas — aquí la forma es
            exactamente la que se pide, sin sorpresas de composición. */}
        <div
          className="absolute inset-x-0 bottom-0 h-[62%]"
          style={{
            clipPath: "polygon(30% 0%, 70% 0%, 120% 100%, -20% 100%)",
            background:
              "linear-gradient(to bottom, rgba(120,165,205,0.08) 0%, rgba(150,190,225,0.26) 45%, rgba(195,220,242,0.40) 100%)",
          }}
        />

        {piezas.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              // El ancla es la BASE de la pieza, que es donde toca el suelo: anclando por
              // el centro, las de atrás parecerían flotar.
              transform: `translate(-50%, -100%) scale(${p.escala})`,
              transformOrigin: "bottom center",
              width: "7%",
              maxWidth: "84px",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "12%",
                bottom: "-4%",
                width: "76%",
                height: "16%",
                borderRadius: "50%",
                background:
                  "radial-gradient(ellipse at center, rgba(0,0,0,0.5), rgba(0,0,0,0) 70%)",
                filter: `blur(${1 + desenfoqueDeFila(p.fila)}px)`,
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/piezas/${JUEGO}/${p.sprite}.svg`}
              alt=""
              style={{
                display: "block",
                width: "100%",
                filter: `blur(${desenfoqueDeFila(p.fila)}px) drop-shadow(0 4px 6px rgba(0,0,0,0.55))`,
                // Las de atrás, más apagadas: niebla de distancia.
                opacity: 1 - (p.fila - 1) * 0.075,
              }}
            />
          </div>
        ))}
      </div>

      {/* EL FOCO: una luz cálida arriba. La luz es lo que más cuesta falsificar y lo que
          más se nota cuando está. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 70% at 50% 6%, rgba(255,255,255,0.20), rgba(255,255,255,0) 55%)",
        }}
      />
      {/* La viñeta, que funde la escena con la cabecera y deja legible el texto. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,31,51,0.90) 0%, rgba(11,31,51,0.40) 42%, rgba(11,31,51,0.86) 100%)",
        }}
      />
    </div>
  );
}
