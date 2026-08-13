"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ponerApodo, resolverMote } from "./actions";

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
  apodoSolicitado,
  nombreOficial,
}: {
  playerId: string;
  apodo: string | null;
  /** Lo que ha pedido el socio y está sin aprobar (migración 0043). */
  apodoSolicitado: string | null;
  /** Para el `aria-label`: con 46 campos iguales, "Mote" a secas no dice de quién. */
  nombreOficial: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function decidir(aprobar: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await resolverMote(playerId, aprobar);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  // LO PEDIDO MANDA SOBRE EL CAMPO: si hay una solicitud, lo que toca es decidirla, no
  // escribir otro mote encima. Poner uno a mano con una solicitud viva la dejaría
  // colgada, y el socio seguiría viendo "la junta lo tiene que aprobar" para siempre.
  if (apodoSolicitado) {
    return (
      <span className="flex flex-col items-end gap-1">
        <span className="text-xs text-tinta-suave">
          pide <b className="font-semibold text-tinta">{apodoSolicitado}</b>
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => decidir(true)}
            aria-label={`Aprobar el mote ${apodoSolicitado} para ${nombreOficial}`}
            className="rounded-lg bg-acento-fuerte px-2 py-1 text-xs font-semibold text-sobre-acento disabled:opacity-50"
          >
            Aprobar
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => decidir(false)}
            aria-label={`Rechazar el mote ${apodoSolicitado} para ${nombreOficial}`}
            className="rounded-lg border border-borde px-2 py-1 text-xs text-tinta-suave disabled:opacity-50"
          >
            No
          </button>
        </span>
        {error && (
          <span className="max-w-40 text-right text-[0.65rem] text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </span>
    );
  }

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
