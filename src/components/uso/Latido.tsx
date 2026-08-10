"use client";

import { useEffect, useRef } from "react";
import { latir } from "./actions";

/**
 * El latido de uso: cada 5 minutos, si la pestaña está delante, avisa al
 * servidor de que hay alguien. Montado una vez en el layout del club; no pinta
 * nada.
 *
 * SOLO CON LA PESTAÑA VISIBLE, y no es un detalle: una pestaña olvidada en
 * segundo plano durante la noche sumaría ocho horas de "uso" que no existieron.
 * `visibilitychange` además cubre la vuelta: al volver a la pestaña tras un
 * rato fuera se late al momento, sin esperar al siguiente tic.
 *
 * LA VISITA (el primer latido) SE APUNTA UNA VEZ POR MONTAJE, no por tic: es lo
 * que cuenta "entradas a la app". Navegar por dentro no re-monta el layout, así
 * que moverse entre pantallas no infla las visitas.
 */
const CADA_MS = 5 * 60_000;

export function Latido() {
  /** Para no apuntar dos visitas si React re-ejecuta el efecto (StrictMode). */
  const visitaApuntada = useRef(false);
  /** Último latido, para que el visibilitychange no ametralle al servidor si
   *  se cambia de pestaña muchas veces seguidas. */
  const ultimo = useRef(0);

  useEffect(() => {
    function late(esVisita: boolean) {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (!esVisita && ahora - ultimo.current < CADA_MS - 5_000) return;
      ultimo.current = ahora;
      void latir(esVisita);
    }

    if (!visitaApuntada.current) {
      visitaApuntada.current = true;
      late(true);
    }

    // El navegador FRENA los temporizadores de una pestaña en segundo plano
    // (lección del analizador): este intervalo puede llegar tarde, y no pasa
    // nada — un latido de menos es tiempo sin contar, nunca de más.
    const t = setInterval(() => late(false), CADA_MS);
    const alVolver = () => late(false);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  return null;
}
