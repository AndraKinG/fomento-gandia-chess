"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SITIOS } from "@/lib/asistente/boton";
import { elegirAsistente } from "./actions";

/**
 * Dónde va el botón del asistente, o si no va.
 *
 * MISMO PATRÓN QUE `EligeTablero`/`EligePiezas`: se elige y se guarda solo, sin botón
 * de guardar. Y aquí importa más que en los otros dos, porque este ajuste es el único
 * que puede hacer DESAPARECER algo de la pantalla: verlo cambiar al momento es lo que
 * hace evidente que se vuelve a encender desde el mismo sitio.
 */
export function EligeAsistente({ actual }: { actual: string }) {
  const [elegido, setElegido] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();
  const router = useRouter();

  function elegir(clave: string) {
    setElegido(clave);
    setError(null);
    empezar(async () => {
      const r = await elegirAsistente(clave);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-tinta">Botón del asistente</p>
      <div className="flex flex-wrap gap-2">
        {SITIOS.map((s) => (
          <button
            key={s.clave}
            type="button"
            onClick={() => elegir(s.clave)}
            aria-pressed={elegido === s.clave}
            className={`rounded-xl px-3 py-2 text-left text-sm transition ${
              elegido === s.clave
                ? "bg-acento-fuerte text-sobre-acento"
                : "bg-tarjeta-suave text-tinta ring-1 ring-borde hover:ring-borde-acento"
            }`}
          >
            {s.nombre}
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        {SITIOS.find((s) => s.clave === elegido)?.detalle}.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
