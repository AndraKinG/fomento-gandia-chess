"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Temporada } from "@/lib/temporadas";

/**
 * Desplegable para cambiar de temporada.
 *
 * NO SE PINTA SI SOLO HAY UNA. Mientras el club tenga una sola temporada —hoy— un
 * desplegable con una única opción es ruido; aparece solo cuando de verdad hay dónde
 * elegir.
 *
 * Es un `select` y no una fila de pastillas porque la lista crece una entrada al año y
 * no tiene fin. Al elegir la activa se QUITA el parámetro de la URL en vez de escribirlo:
 * así el enlace normal se queda limpio y no caduca al cambiar de temporada.
 */
export function SelectorTemporada({
  temporadas,
  actual,
}: {
  temporadas: Temporada[];
  actual: Temporada;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, empezar] = useTransition();

  if (temporadas.length < 2) return null;

  function cambiar(id: string) {
    const siguientes = new URLSearchParams(params.toString());
    const elegida = temporadas.find((t) => t.id === id);
    if (!elegida || elegida.activa) siguientes.delete("temporada");
    else siguientes.set("temporada", id);
    const cadena = siguientes.toString();
    empezar(() => router.push(cadena ? `${pathname}?${cadena}` : pathname));
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Temporada</span>
      <select
        value={actual.id}
        disabled={pendiente}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-sm text-tinta disabled:opacity-60"
      >
        {temporadas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
            {t.activa ? " · en curso" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
