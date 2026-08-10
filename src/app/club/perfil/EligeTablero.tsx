"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEMAS_TABLERO } from "@/lib/ajedrez/temas";
import { elegirTablero } from "./actions";

/**
 * El selector del tema del tablero, con cada opción pintada como un mini
 * tablero de 4×4: los colores se eligen viéndolos, no leyendo un nombre.
 *
 * OPTIMISTA: se marca la elegida al momento y se guarda detrás. Si el guardado
 * falla se dice, pero no se bloquea el botón mientras tanto — cambiar de tema no
 * es una operación delicada, es probar colores.
 */
export function EligeTablero({ actual }: { actual: string }) {
  const [elegido, setElegido] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();
  const router = useRouter();

  function elegir(clave: string) {
    setElegido(clave);
    setError(null);
    empezar(async () => {
      const r = await elegirTablero(clave);
      if (r.error) setError(r.error);
      // Refresca para que el layout provea el tema nuevo a todos los tableros.
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-tinta">Tablero</p>
      <div className="flex flex-wrap gap-3">
        {TEMAS_TABLERO.map((t) => (
          <button
            key={t.clave}
            type="button"
            onClick={() => elegir(t.clave)}
            aria-pressed={elegido === t.clave}
            title={t.nombre}
            className={`overflow-hidden rounded-lg transition ${
              elegido === t.clave
                ? "ring-2 ring-acento-fuerte ring-offset-2 ring-offset-tarjeta"
                : "ring-1 ring-borde hover:ring-borde-acento"
            }`}
          >
            <span aria-hidden className="grid h-14 w-14 grid-cols-4">
              {Array.from({ length: 16 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    backgroundColor:
                      (Math.floor(i / 4) + i) % 2 === 0 ? t.clara : t.oscura,
                  }}
                />
              ))}
            </span>
            <span className="sr-only">{t.nombre}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        {TEMAS_TABLERO.find((t) => t.clave === elegido)?.nombre}. Se aplica a todos
        los tableros y te sigue en cualquier dispositivo.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
