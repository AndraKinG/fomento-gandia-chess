"use client";

import { useState, useTransition } from "react";
import { cambiarFavorita } from "./actions";

/**
 * Estrella de "guardar esta partida".
 *
 * SE PINTA ANTES DE QUE CONTESTE EL SERVIDOR y se deshace si falla: marcar una
 * favorita es un gesto de un dedo y esperar medio segundo a que se encienda la
 * convierte en algo que parece roto. El dato de verdad llega en el siguiente
 * pintado del servidor.
 *
 * FRENA EL ENLACE DE LA TARJETA: en la lista, la estrella vive DENTRO del `Link` que
 * abre la partida (es lo que deja poner el botón en su esquina sin partir la tarjeta
 * en dos zonas clicables). Sin `preventDefault`, marcar una favorita te sacaba de la
 * lista a la partida.
 */
export function Estrella({
  gameId,
  favorita,
  tamano = "normal",
}: {
  gameId: string;
  favorita: boolean;
  /** `grande` en el detalle de la partida, donde es una acción más y no un adorno. */
  tamano?: "normal" | "grande";
}) {
  const [marcada, setMarcada] = useState(favorita);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={marcada}
      aria-label={marcada ? "Quitar de favoritas" : "Guardar en favoritas"}
      title={marcada ? "Quitar de favoritas" : "Guardar en favoritas"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const siguiente = !marcada;
        setMarcada(siguiente);
        startTransition(async () => {
          const r = await cambiarFavorita(gameId, siguiente);
          // Si el servidor dice que no, la estrella vuelve a donde estaba: dejarla
          // encendida sería mentir sobre lo que hay guardado.
          if (r.error) setMarcada(!siguiente);
        });
      }}
      className={`shrink-0 leading-none transition duration-100 active:scale-90 ${
        tamano === "grande" ? "text-2xl" : "text-base"
      } ${marcada ? "text-amber-500" : "text-tinta-suave hover:text-amber-500"}`}
    >
      {marcada ? "★" : "☆"}
    </button>
  );
}
