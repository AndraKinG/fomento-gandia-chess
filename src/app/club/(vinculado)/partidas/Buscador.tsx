"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Búsqueda por nombre. Es un formulario de verdad (no un filtrado en vivo) para
 * que la búsqueda quede en la URL: así se puede compartir un enlace a "las
 * partidas contra Pérez" y el botón de atrás del móvil funciona como se espera.
 */
export function Buscador({ valor, soloMias }: { valor: string; soloMias: boolean }) {
  const [texto, setTexto] = useState(valor);
  const router = useRouter();

  function buscar(q: string) {
    const params = new URLSearchParams();
    if (soloMias) params.set("mias", "1");
    if (q.trim()) params.set("q", q.trim());
    const cadena = params.toString();
    router.push(`/club/partidas${cadena ? `?${cadena}` : ""}`);
  }

  return (
    <form
      // Con `panel` el campo se estiraba a 970 px para un nombre y pico. Un buscador
      // más largo que ancho no ayuda a escribir.
      className="flex max-w-xl gap-2"
      action={() => {
        buscar(texto);
      }}
    >
      <input
        type="search"
        name="q"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por nombre (tuyo o del rival)"
        aria-label="Buscar partidas por nombre"
        className="flex-1 rounded-xl border border-borde bg-tarjeta px-3 py-2 text-tinta placeholder:text-tinta-suave"
      />
      <button
        type="submit"
        className="rounded-xl bg-acento-fuerte px-4 font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]"
      >
        Buscar
      </button>
      {valor && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            buscar("");
          }}
          className="rounded-xl border border-borde bg-tarjeta px-3 text-sm text-tinta-suave transition duration-100 hover:bg-tarjeta-suave"
        >
          Quitar
        </button>
      )}
    </form>
  );
}
