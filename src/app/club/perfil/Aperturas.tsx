"use client";

import { useState, useTransition } from "react";
import { guardarAperturas } from "./actions";

/**
 * Las aperturas favoritas, en una línea de texto libre.
 *
 * TEXTO LIBRE Y NO UN CATÁLOGO a propósito: hay cientos de aperturas con
 * variantes, y un desplegable o quedaría corto o sería inmanejable. "Italiana y
 * Najdorf" escrito a mano dice lo mismo y no obliga a mantener ninguna lista.
 */
export function Aperturas({ inicial }: { inicial: string }) {
  const [texto, setTexto] = useState(inicial);
  const [guardado, setGuardado] = useState<string>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await guardarAperturas(texto);
      if (r.error) setError(r.error);
      else setGuardado(texto.trim());
    });
  }

  const sinCambios = texto.trim() === guardado.trim();

  return (
    <div className="space-y-2">
      <label htmlFor="aperturas" className="block text-sm font-semibold text-tinta">
        Mis aperturas
      </label>
      <div className="flex gap-2">
        <input
          id="aperturas"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !sinCambios) guardar();
          }}
          maxLength={120}
          placeholder="Italiana, Siciliana Najdorf…"
          className="min-w-0 flex-1 rounded-xl border border-borde bg-tarjeta px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave"
        />
        <button
          type="button"
          disabled={pendiente || sinCambios}
          onClick={guardar}
          className="shrink-0 rounded-xl bg-acento-fuerte px-3 py-2 text-sm font-semibold text-sobre-acento disabled:opacity-40"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <p className="text-xs text-tinta-suave">Salen en tu ficha de socio.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
