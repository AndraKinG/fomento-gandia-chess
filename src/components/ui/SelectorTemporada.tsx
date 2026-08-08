"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Temporada } from "@/lib/temporadas";

/**
 * Desplegable para cambiar de temporada.
 *
 * NO USA `useSearchParams()`, y esto no es un detalle: la primera versión lo usaba y el
 * `select` **no llegaba a hidratarse en producción**. `useSearchParams` obliga a
 * renderizar en cliente todo el árbol hasta el `Suspense` más cercano y, sin uno, el
 * componente se pintaba en el HTML pero se quedaba sin manejadores: se veía, se podía
 * desplegar y al elegir no pasaba nada. Se detectó comprobando que el `select` no tenía
 * props de React mientras la barra de navegación sí.
 *
 * La ruta y los parámetros que hay que conservar llegan del servidor, que ya los conoce.
 * Así no hace falta ni el hook ni un `Suspense` alrededor.
 *
 * NO SE PINTA SI SOLO HAY UNA TEMPORADA: un desplegable de una sola opción es ruido.
 */
export function SelectorTemporada({
  temporadas,
  actual,
  ruta,
  extra = {},
}: {
  temporadas: Temporada[];
  actual: Temporada;
  /** Ruta a la que volver, sin parámetros. */
  ruta: string;
  /** Parámetros de la pantalla que hay que mantener al cambiar (p. ej. `por=elo`). */
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  if (temporadas.length < 2) return null;

  function cambiar(id: string) {
    const params = new URLSearchParams(extra);
    const elegida = temporadas.find((t) => t.id === id);
    // En la temporada en curso NO se escribe el parámetro: el enlace se queda limpio.
    if (elegida && !elegida.activa) params.set("temporada", id);
    const cadena = params.toString();
    empezar(() => router.push(cadena ? `${ruta}?${cadena}` : ruta));
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
