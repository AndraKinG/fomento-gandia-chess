"use client";

import { useRouter } from "next/navigation";

/**
 * Flecha de volver a la pantalla ANTERIOR, sea cual sea.
 *
 * La `Cabecera` normal recibe un `volverA` fijo, y para casi todas las pantallas
 * vale: se llega a ellas desde un sitio. Al perfil no: se llega desde cualquiera,
 * porque su acceso está en todas las cabeceras. Mandarle un destino fijo sería
 * mentir la mitad de las veces —te sacaría a Inicio viniendo de una partida—, así
 * que aquí se usa el historial del navegador, que sabe de dónde vienes de verdad.
 */
export function Volver() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Volver"
      className="-ml-1 shrink-0 rounded-lg px-1 text-2xl leading-none text-sobre-acento transition hover:bg-white/15"
    >
      ←
    </button>
  );
}
