"use client";

import { useState, useTransition } from "react";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { guardarPreferenciasAvisos } from "./actions";
import type { GrupoAviso } from "@/lib/avisos/politica";

const ETIQUETAS: Record<GrupoAviso, { titulo: string; detalle: string }> = {
  interclubs: {
    titulo: "Interclubs",
    detalle:
      "Disponibilidad y sus recordatorios. La convocatoria avisa siempre, aunque apagues esto: si el capitán te alinea, te enteras.",
  },
  torneos: {
    titulo: "Torneos",
    detalle: "Torneos de interés, plazas de coche e inscripciones.",
  },
  partidas: {
    titulo: "Partidas",
    detalle: "Que alguien ha aceptado un reto tuyo.",
  },
  gestion: {
    titulo: "Gestión",
    detalle: "Altas de socios, vinculaciones pendientes y fichas nuevas del orden de fuerza.",
  },
};

/** Orden fijo de los interruptores en la pantalla. */
const ORDEN: GrupoAviso[] = ["interclubs", "torneos", "partidas", "gestion"];

export function PreferenciasAvisos({
  silenciadosIniciales,
  mostrarGestion,
}: {
  silenciadosIniciales: GrupoAviso[];
  /** El grupo "gestion" solo le llega a admin/junta (ver `GRUPO_DE` en
   *  politica.ts): a un jugador normal no le sirve de nada verlo, así que
   *  enseñárselo solo confunde. El rango se decide en el servidor
   *  (`sesionActual`), nunca aquí. */
  mostrarGestion: boolean;
}) {
  const [silenciados, setSilenciados] = useState<Set<GrupoAviso>>(
    () => new Set(silenciadosIniciales)
  );
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const grupos = mostrarGestion ? ORDEN : ORDEN.filter((g) => g !== "gestion");

  function alternar(grupo: GrupoAviso) {
    setError(null);
    // Encendido = recibo push, y la columna guarda lo SILENCIADO: activar el
    // interruptor significa QUITARLO del set, no metérselo.
    const anterior = silenciados;
    const siguiente = new Set(anterior);
    if (siguiente.has(grupo)) siguiente.delete(grupo);
    else siguiente.add(grupo);
    setSilenciados(siguiente);

    startTransition(async () => {
      const r = await guardarPreferenciasAvisos(Array.from(siguiente));
      if (r.error) {
        setError(r.error);
        // Revierte: la pantalla no puede quedarse diciendo "recibo" (o
        // "silenciado") si la base no se ha enterado.
        setSilenciados(anterior);
      }
    });
  }

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-tinta">Avisos al móvil</p>
        <p className="text-xs text-tinta-suave">
          Esto controla solo el aviso push a tu teléfono. La bandeja del club
          (la campana del menú) recibe siempre todos los avisos, los apagues
          aquí o no.
        </p>
      </div>

      {error && <Banner tipo="error">{error}</Banner>}

      <div className="flex flex-col divide-y divide-borde">
        {grupos.map((grupo) => {
          const activo = !silenciados.has(grupo);
          return (
            <div
              key={grupo}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 pr-2">
                <p className="text-sm font-medium text-tinta">{ETIQUETAS[grupo].titulo}</p>
                <p className="text-xs text-tinta-suave">{ETIQUETAS[grupo].detalle}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={activo}
                aria-label={`Avisos al móvil de ${ETIQUETAS[grupo].titulo}`}
                disabled={pendiente}
                onClick={() => alternar(grupo)}
                className={`w-28 shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-50 ${
                  activo
                    ? "bg-acento-fuerte text-sobre-acento"
                    : "border border-borde bg-tarjeta text-tinta-suave"
                }`}
              >
                {activo ? "✓ Recibo" : "Silenciado"}
              </button>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}
