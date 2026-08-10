"use client";

import { useState } from "react";

/**
 * El selector de cadencia: las tres de siempre como botones, y "Otra" para
 * ponerla a mano.
 *
 * LOS BOTONES SIGUEN DELANTE a propósito: el 90 % de las veces se juega a lo de
 * siempre y dos toques bastan. El campo libre existe porque una partida lenta
 * del club (30+30, 60+0) no puede depender de que esté en la lista — pero no
 * sustituye a los botones, los completa.
 *
 * Es el MISMO selector para retos y para torneos internos: si mañana cambia el
 * tope o se añade una cadencia de moda, cambia en un sitio.
 *
 * Los topes (1–180 min, 0–60 s) son los del servidor (`retar`) y los CHECK de
 * la base (migración 0023): aquí solo se acota lo que se teclea para no mandar
 * nada que el servidor vaya a rechazar con un error más feo.
 */

export const CADENCIAS_DE_SIEMPRE = [
  { etiqueta: "3+2", baseMin: 3, incrementoS: 2 },
  { etiqueta: "5+3", baseMin: 5, incrementoS: 3 },
  { etiqueta: "10+5", baseMin: 10, incrementoS: 5 },
] as const;

export type Cadencia = { baseMin: number; incrementoS: number };

function acotar(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function ElegirCadencia({
  valor,
  onCambiar,
}: {
  valor: Cadencia;
  onCambiar: (c: Cadencia) => void;
}) {
  const esPreestablecida = CADENCIAS_DE_SIEMPRE.some(
    (c) => c.baseMin === valor.baseMin && c.incrementoS === valor.incrementoS
  );
  // "Otra" se queda abierta aunque se teclee justo un valor de la lista: cerrar
  // el campo debajo de los dedos porque 10+5 coincide con un botón es un susto.
  const [aMano, setAMano] = useState(!esPreestablecida);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CADENCIAS_DE_SIEMPRE.map((c) => (
          <button
            key={c.etiqueta}
            type="button"
            onClick={() => {
              setAMano(false);
              onCambiar({ baseMin: c.baseMin, incrementoS: c.incrementoS });
            }}
            aria-pressed={!aMano && valor.baseMin === c.baseMin && valor.incrementoS === c.incrementoS}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-100 ${
              !aMano && valor.baseMin === c.baseMin && valor.incrementoS === c.incrementoS
                ? "bg-acento-fuerte text-sobre-acento"
                : "border border-borde bg-tarjeta text-tinta-suave"
            }`}
          >
            {c.etiqueta}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAMano(true)}
          aria-pressed={aMano}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-100 ${
            aMano
              ? "bg-acento-fuerte text-sobre-acento"
              : "border border-borde bg-tarjeta text-tinta-suave"
          }`}
        >
          Otra
        </button>
      </div>

      {aMano && (
        <div className="flex items-center gap-2 text-sm text-tinta">
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={180}
              value={valor.baseMin}
              onChange={(e) =>
                onCambiar({ ...valor, baseMin: acotar(Number(e.target.value) || 1, 1, 180) })
              }
              className="w-20 rounded-lg border border-borde bg-tarjeta px-2 py-1.5 text-right tabular-nums"
            />
            min
          </label>
          <span aria-hidden className="text-tinta-suave">
            +
          </span>
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={60}
              value={valor.incrementoS}
              onChange={(e) =>
                onCambiar({ ...valor, incrementoS: acotar(Number(e.target.value) || 0, 0, 60) })
              }
              className="w-16 rounded-lg border border-borde bg-tarjeta px-2 py-1.5 text-right tabular-nums"
            />
            s por jugada
          </label>
        </div>
      )}
    </div>
  );
}
