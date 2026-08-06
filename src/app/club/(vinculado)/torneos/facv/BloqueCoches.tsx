"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import {
  apuntarseACoche,
  bajarseDeCoche,
  borrarCoche,
  ofrecerCoche,
} from "./actions";

export type CocheVista = {
  id: string;
  conductorNombre: string;
  esMiCoche: boolean;
  plazas: number;
  libres: number;
  horaSalida: string | null;
  puntoSalida: string | null;
  notas: string | null;
  pasajeros: string[];
  /** true si el usuario actual viaja en ESTE coche. */
  voyEnEste: boolean;
};

export function BloqueCoches({
  tournamentId,
  coches,
  puedoOfrecer,
  voyEnAlgunCoche,
}: {
  tournamentId: string;
  coches: CocheVista[];
  /** El servidor ya ha decidido si puede: va al torneo y no conduce ni viaja. */
  puedoOfrecer: boolean;
  voyEnAlgunCoche: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function ejecutar(accion: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) {
        setError(r.error);
        return;
      }
      setFormAbierto(false);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
        Coches
      </h2>

      {error && <Banner tipo="error">{error}</Banner>}

      {coches.length === 0 && (
        <Tarjeta compacta>
          <p className="text-sm text-tinta-suave">
            Todavía nadie ha ofrecido coche para este torneo.
          </p>
        </Tarjeta>
      )}

      {coches.map((c) => (
        <Tarjeta key={c.id} destacada={c.esMiCoche || c.voyEnEste}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-tinta">
                {c.conductorNombre}
                {c.esMiCoche && (
                  <span className="ml-2 text-xs font-normal text-tinta-suave">(tu coche)</span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-tinta-suave">
                {c.horaSalida ? `Sale a las ${c.horaSalida}` : "Hora por confirmar"}
                {c.puntoSalida ? ` · ${c.puntoSalida}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                c.libres > 0
                  ? "bg-tarjeta-suave text-acento-texto ring-borde-acento"
                  : "bg-tarjeta text-tinta-suave ring-borde"
              }`}
            >
              {c.libres > 0 ? `${c.libres} de ${c.plazas} libres` : "Completo"}
            </span>
          </div>

          {c.pasajeros.length > 0 && (
            <p className="mt-2 text-sm text-tinta">
              <span className="text-tinta-suave">Van: </span>
              {c.pasajeros.join(", ")}
            </p>
          )}

          {c.notas && <p className="mt-2 text-sm text-tinta-suave">{c.notas}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {c.voyEnEste && (
              <Boton
                variante="secundario"
                className="px-3 py-1.5 text-sm"
                disabled={pendiente}
                onClick={() => ejecutar(() => bajarseDeCoche(tournamentId))}
              >
                Bajarme
              </Boton>
            )}
            {!c.voyEnEste && !c.esMiCoche && !voyEnAlgunCoche && c.libres > 0 && (
              <Boton
                variante="solido"
                className="px-3 py-1.5 text-sm"
                disabled={pendiente}
                onClick={() => ejecutar(() => apuntarseACoche(tournamentId, c.id))}
              >
                Me apunto
              </Boton>
            )}
            {c.esMiCoche && (
              <Boton
                variante="secundario"
                className="px-3 py-1.5 text-sm"
                disabled={pendiente}
                onClick={() => ejecutar(() => borrarCoche(tournamentId, c.id))}
              >
                Quitar mi coche
              </Boton>
            )}
          </div>
        </Tarjeta>
      ))}

      {puedoOfrecer && !formAbierto && (
        <Boton
          variante="degradado"
          className="w-full"
          onClick={() => setFormAbierto(true)}
        >
          Ofrezco coche
        </Boton>
      )}

      {formAbierto && (
        <Tarjeta>
          <form
            className="flex flex-col gap-3"
            action={(formData) => {
              ejecutar(() =>
                ofrecerCoche(tournamentId, {
                  plazas: Number(formData.get("plazas")),
                  horaSalida: String(formData.get("horaSalida") ?? ""),
                  puntoSalida: String(formData.get("puntoSalida") ?? ""),
                  notas: String(formData.get("notas") ?? ""),
                })
              );
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="plazas" className="text-sm text-tinta">
                Plazas libres (sin contarte)
              </label>
              <input
                id="plazas"
                name="plazas"
                type="number"
                min={1}
                max={8}
                defaultValue={3}
                required
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="horaSalida" className="text-sm text-tinta">
                Hora de salida
              </label>
              <input
                id="horaSalida"
                name="horaSalida"
                type="text"
                placeholder="08:30"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="puntoSalida" className="text-sm text-tinta">
                Dónde recoges
              </label>
              <input
                id="puntoSalida"
                name="puntoSalida"
                type="text"
                placeholder="En el local del club"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="notas" className="text-sm text-tinta">
                Algo más (opcional)
              </label>
              <input
                id="notas"
                name="notas"
                type="text"
                placeholder="Volvemos justo al acabar"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
              />
            </div>
            <div className="flex gap-2">
              <Boton variante="solido" type="submit" disabled={pendiente} className="flex-1">
                {pendiente ? "Guardando…" : "Ofrecer coche"}
              </Boton>
              <Boton
                variante="secundario"
                onClick={() => setFormAbierto(false)}
                disabled={pendiente}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}
    </section>
  );
}
