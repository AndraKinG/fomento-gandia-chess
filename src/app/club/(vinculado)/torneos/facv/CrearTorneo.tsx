"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { crearTorneoManual } from "./actions";

/**
 * Crear un torneo que no está en el calendario oficial de la FACV.
 *
 * Solo se muestra a junta y admin, y el permiso lo vuelve a comprobar la acción:
 * esconder un botón no es un permiso.
 */
export function CrearTorneo({
  puedeCrear,
  pestanas,
  acciones,
}: {
  puedeCrear: boolean;
  /** Las pestañas de la sección, que vienen del servidor. */
  pestanas: React.ReactNode;
  /** Los demás botones de la barra, también del servidor. */
  acciones: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  // MONTA LA BARRA ENTERA, no solo su botón. El formulario tiene que salir DEBAJO de
  // la fila: cuando vivía dentro, al abrirlo se llevaba el ancho y dejaba las pestañas
  // "De fuera / Del club" partidas en dos líneas y descolocadas en mitad del hueco.
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {pestanas}
        <div className="flex flex-wrap items-center gap-2">
          {acciones}
          {puedeCrear && !abierto && (
            <Boton
              variante="secundario"
              className="text-sm"
              onClick={() => setAbierto(true)}
            >
              Crear torneo
            </Boton>
          )}
        </div>
      </div>

      {abierto && (
        <Tarjeta destacada>
          {error && (
            <div className="mb-3">
              <Banner tipo="error">{error}</Banner>
            </div>
          )}
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const r = await crearTorneoManual({
                  nombre: String(fd.get("nombre") ?? ""),
                  fechaInicio: String(fd.get("fechaInicio") ?? ""),
                  fechaFin: String(fd.get("fechaFin") ?? ""),
                  lugar: String(fd.get("lugar") ?? ""),
                  organizador: String(fd.get("organizador") ?? ""),
                });
                if (r.error) {
                  setError(r.error);
                  return;
                }
                setAbierto(false);
                router.refresh();
              });
            }}
          >
            <p className="text-xs text-tinta-suave">
              Solo para lo que no publica la FACV: amistosos, torneos de otras
              federaciones… Para ir a uno del calendario basta con decir que vas.
            </p>
            <Campo id="nombre" etiqueta="Nombre" requerido />
            <div className="grid grid-cols-2 gap-3">
              <Campo id="fechaInicio" etiqueta="Empieza" tipo="date" requerido />
              <Campo id="fechaFin" etiqueta="Acaba (si dura más)" tipo="date" />
            </div>
            <Campo id="lugar" etiqueta="Lugar" />
            <Campo id="organizador" etiqueta="Organiza" />
            <div className="flex gap-2">
              <Boton variante="solido" type="submit" disabled={pendiente} className="flex-1">
                {pendiente ? "Creando…" : "Crear"}
              </Boton>
              <Boton
                variante="secundario"
                onClick={() => setAbierto(false)}
                disabled={pendiente}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  tipo = "text",
  requerido = false,
}: {
  id: string;
  etiqueta: string;
  tipo?: "text" | "date";
  requerido?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-tinta">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        type={tipo}
        required={requerido}
        className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
      />
    </div>
  );
}
