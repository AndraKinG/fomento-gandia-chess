"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir la pantalla cada cierto tiempo, para que los datos de fuera se
 * actualicen solos.
 *
 * PARA QUÉ NACE: la clasificación de un torneo presencial la lleva ChessPairings, y
 * mientras se juega una ronda cambia sin que nadie toque nada aquí. El servidor ya
 * recachea su respuesta cada 60 s, pero **eso no repinta una pantalla que ya está
 * abierta**: si alguien deja el torneo puesto en el móvil, se queda con la foto de cuando
 * entró. Esto es la otra mitad.
 *
 * SOLO CON LA PESTAÑA DELANTE, y es lo que evita que esto sea un problema: un móvil
 * olvidado en el bolsillo con el torneo abierto pediría la pantalla toda la noche, y cada
 * pedido son peticiones a una API ajena y gratuita que contesta 429 si se abusa. Con
 * `visibilitychange` se para al esconder la pestaña y se pone al día al volver.
 *
 * `router.refresh()` Y NO `location.reload()`: rehace los componentes de servidor y
 * conserva el estado del cliente —el scroll, un desplegable abierto— en vez de saltar
 * arriba y perderlo todo cada minuto.
 */
export function RefrescarCada({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const ms = Math.max(15, segundos) * 1000;
    let reloj: ReturnType<typeof setInterval> | null = null;

    const arrancar = () => {
      if (reloj !== null) return;
      reloj = setInterval(() => router.refresh(), ms);
    };
    const parar = () => {
      if (reloj === null) return;
      clearInterval(reloj);
      reloj = null;
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        // Al volver se pide una vez ya: quien deja el móvil diez minutos y vuelve quiere
        // ver lo de ahora, no esperar el siguiente tic.
        router.refresh();
        arrancar();
      } else {
        parar();
      }
    };

    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [router, segundos]);

  return null;
}
