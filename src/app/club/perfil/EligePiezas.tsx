"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JUEGOS_PIEZAS, rutaPieza } from "@/lib/ajedrez/piezas";
import { elegirPiezas } from "./actions";

/**
 * El selector del juego de piezas, espejo del de colores (`EligeTablero`).
 *
 * Cada opción enseña el CABALLO blanco y negro del juego: es la pieza con más
 * personalidad de cualquier diseño —rey y peón se parecen entre juegos— y con
 * verla se sabe si el estilo te gusta sin leer nada.
 */
export function EligePiezas({ actual }: { actual: string }) {
  const [elegido, setElegido] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();
  const router = useRouter();

  function elegir(clave: string) {
    setElegido(clave);
    setError(null);
    empezar(async () => {
      const r = await elegirPiezas(clave);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-tinta">Piezas</p>
      <div className="flex flex-wrap gap-3">
        {JUEGOS_PIEZAS.map((j) => (
          <button
            key={j.clave}
            type="button"
            onClick={() => elegir(j.clave)}
            aria-pressed={elegido === j.clave}
            title={j.nombre}
            className={`rounded-lg bg-tarjeta-suave p-1.5 transition ${
              elegido === j.clave
                ? "ring-2 ring-acento-fuerte ring-offset-2 ring-offset-tarjeta"
                : "ring-1 ring-borde hover:ring-borde-acento"
            }`}
          >
            <span aria-hidden className="flex">
              {/* eslint-disable-next-line @next/next/no-img-element -- iconos
                  locales diminutos: pasarlos por el optimizador no aporta */}
              <img src={rutaPieza(j.clave, "w", "n")} alt="" className="h-11 w-11" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rutaPieza(j.clave, "b", "n")} alt="" className="h-11 w-11" />
            </span>
            <span className="sr-only">{j.nombre}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        {JUEGOS_PIEZAS.find((j) => j.clave === elegido)?.nombre}.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
