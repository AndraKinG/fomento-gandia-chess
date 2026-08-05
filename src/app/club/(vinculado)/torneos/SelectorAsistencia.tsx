"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonesAsistencia } from "@/components/ui/BotonesAsistencia";
import { marcarAsistencia } from "./actions";

type Valor = "voy" | "no_voy" | "duda" | null;

/**
 * Selector de "¿vas?" de un torneo: actualización optimista y vuelta atrás si el
 * servidor rechaza el cambio.
 *
 * El rechazo no es hipotético: un conductor con pasajeros no puede decir que no
 * va, y esa comprobación solo la sabe hacer el servidor con el estado completo
 * de los coches. Sin la vuelta atrás, el botón se quedaría marcado en un valor
 * que la base de datos nunca aceptó.
 */
export function SelectorAsistencia({
  tournamentId,
  valorInicial,
}: {
  tournamentId: string;
  valorInicial: Valor;
}) {
  const [valor, setValor] = useState<Valor>(valorInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function onCambio(nuevo: Exclude<Valor, null>) {
    const anterior = valor;
    setValor(nuevo);
    setError(null);
    startTransition(async () => {
      const r = await marcarAsistencia(tournamentId, nuevo);
      if (r.error) {
        setValor(anterior);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <BotonesAsistencia valor={valor} onCambio={onCambio} deshabilitado={pendiente} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
