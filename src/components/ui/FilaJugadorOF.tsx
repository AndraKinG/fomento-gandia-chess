import type { ReactNode } from "react";
import { Tarjeta } from "./Tarjeta";

/**
 * Fila "badge redondo + nombre + chips" del orden de fuerza (extraída de
 * admin/orden-fuerza para reutilizarla donde haga falta listar jugadores por
 * número de orden).
 */
export function FilaJugadorOF({
  numero, bisIndex, nombre, chips,
}: {
  numero: number;
  bisIndex: number;
  nombre: string;
  chips?: ReactNode;
}) {
  return (
    <Tarjeta compacta className="flex items-center gap-3">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-acento-fuerte font-semibold text-sobre-acento ${
          bisIndex ? "text-[0.65rem]" : "text-sm"
        }`}
      >
        {numero}
        {bisIndex ? "bis" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-tinta">{nombre}</p>
        {chips && <div className="mt-1 flex flex-wrap gap-2">{chips}</div>}
      </div>
    </Tarjeta>
  );
}
