"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ponerEloEstimado } from "@/app/club/(vinculado)/admin/orden-fuerza/actions";

/**
 * El ELO estimado de un socio, editable por junta y admin.
 *
 * ES EL ÚNICO DE LOS TRES ELOS QUE SE PUEDE ESCRIBIR A MANO (el por qué, en la acción
 * `ponerEloEstimado`): el de la FACV lo reescribe la sincronización del viernes, así que
 * un campo para tocarlo sería un campo que se borra solo cada semana sin decir nada.
 *
 * SE GUARDA AL SALIR DEL CAMPO y solo si ha cambiado, igual que el mote: es el mismo
 * gesto y no tiene sentido que uno pida botón y el otro no.
 */
export function EditorEloEstimado({
  playerId,
  eloOtro,
  nombreOficial,
}: {
  playerId: string;
  eloOtro: number | null;
  nombreOficial: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  return (
    <span className="flex flex-col gap-0.5">
      <input
        // La `key` con el valor rehace el campo cuando el servidor manda otro número.
        key={`${playerId}-${eloOtro ?? ""}`}
        type="number"
        min={0}
        max={3500}
        inputMode="numeric"
        defaultValue={eloOtro ?? ""}
        placeholder="Sin estimar"
        aria-label={`ELO estimado de ${nombreOficial}`}
        disabled={pendiente}
        onBlur={(e) => {
          const nuevo = e.target.value.trim();
          if (nuevo === String(eloOtro ?? "")) return;
          setError(null);
          startTransition(async () => {
            const r = await ponerEloEstimado(playerId, nuevo);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
        className="w-full rounded-lg border border-borde bg-tarjeta px-2 py-1 text-sm text-tinta placeholder:text-tinta-suave disabled:opacity-50"
      />
      {error && <span className="text-[0.65rem] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
