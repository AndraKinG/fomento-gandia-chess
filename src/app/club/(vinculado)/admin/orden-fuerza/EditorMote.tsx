"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ponerApodo } from "./actions";

/**
 * El mote del club de un socio, editable en la misma fila.
 *
 * AQUÍ Y NO EN UNA PANTALLA APARTE porque son 46 y se rellenan de una sentada: quien
 * los conoce va bajando la lista y escribiendo. Un formulario por socio, con su
 * navegación de ida y vuelta, garantizaría que se quedaran a medias.
 *
 * SE GUARDA AL SALIR DEL CAMPO, no con un botón: un botón por fila serían 46 botones
 * que hay que acertar en un móvil. Y solo si el valor ha cambiado, para no escribir 46
 * veces en la base al pasar por encima.
 */
export function EditorMote({
  playerId,
  apodo,
  nombreOficial,
}: {
  playerId: string;
  apodo: string | null;
  /** Para el `aria-label`: con 46 campos iguales, "Mote" a secas no dice de quién. */
  nombreOficial: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  return (
    <span className="flex flex-col items-end gap-0.5">
      <input
        // La `key` con el valor rehace el campo cuando el servidor manda otro mote.
        key={`${playerId}-${apodo ?? ""}`}
        type="text"
        defaultValue={apodo ?? ""}
        maxLength={40}
        placeholder="Mote"
        aria-label={`Mote de ${nombreOficial}`}
        disabled={pendiente}
        onBlur={(e) => {
          const nuevo = e.target.value.trim().replace(/\s+/g, " ");
          if (nuevo === (apodo ?? "")) return;
          setError(null);
          startTransition(async () => {
            const r = await ponerApodo(playerId, nuevo);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
        className="w-24 rounded-lg border border-borde bg-tarjeta px-2 py-1 text-xs text-tinta placeholder:text-tinta-suave disabled:opacity-50"
      />
      {error && <span className="text-[0.65rem] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
