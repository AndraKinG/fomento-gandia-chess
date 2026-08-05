"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonesDisponibilidad } from "@/components/ui/BotonesDisponibilidad";
import { marcarDisponibilidad } from "./actions";

type Valor = "disponible" | "no_disponible" | "duda" | null;

/** Selector de disponibilidad de una fecha: actualización optimista + revalidación. */
export function SelectorDisponibilidad({
  fecha, valorInicial,
}: { fecha: string; valorInicial: Valor }) {
  const [valor, setValor] = useState<Valor>(valorInicial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onCambio(nuevo: Exclude<Valor, null>) {
    const anterior = valor;
    setValor(nuevo);
    setError(null);
    startTransition(async () => {
      const resultado = await marcarDisponibilidad(fecha, nuevo);
      if (resultado.error) {
        setValor(anterior);
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <BotonesDisponibilidad valor={valor} onCambio={onCambio} deshabilitado={isPending} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
