"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarFichaTorneo } from "@/app/club/(vinculado)/admin/torneos/actions";

/**
 * Rellenar la información de un torneo desde su propia pantalla. Junta y admin.
 *
 * POR QUÉ AQUÍ Y NO SOLO EN EL PANEL DE ADMIN: la FACV **no tiene página por torneo**
 * —su calendario oficial publica siete columnas y ni un enlace, comprobado en vivo—, así
 * que no hay ninguna URL suya a la que mandar a nadie: esta ficha ES la información. Y
 * el momento en que uno se da cuenta de que falta la hora es mirando el torneo, no
 * entrando en un panel de administración.
 *
 * CON BOTÓN DE GUARDAR, al contrario que el mote y el ELO de un socio: aquí son cuatro
 * campos que se rellenan juntos, y guardar al salir de cada uno serían cuatro escrituras
 * y cuatro refrescos para un solo gesto.
 */
export function EditorFichaTorneo({
  tournamentId,
  hora,
  ritmo,
  infoExtra,
  urlBases,
}: {
  tournamentId: string;
  hora: string | null;
  ritmo: string | null;
  infoExtra: string | null;
  urlBases: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-semibold text-acento-texto hover:underline"
      >
        {hora || ritmo || infoExtra || urlBases
          ? "Editar la información"
          : "Añadir la información"}
      </button>
    );
  }

  return (
    <form
      action={(fd: FormData) => {
        setError(null);
        startTransition(async () => {
          const r = await editarFichaTorneo(tournamentId, {
            hora: String(fd.get("hora") ?? ""),
            ritmo: String(fd.get("ritmo") ?? ""),
            infoExtra: String(fd.get("infoExtra") ?? ""),
            urlBases: String(fd.get("urlBases") ?? ""),
          });
          if (r.error) {
            setError(r.error);
            return;
          }
          setAbierto(false);
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            Hora
          </span>
          <input
            name="hora"
            defaultValue={hora ?? ""}
            placeholder="16:00"
            className="w-full rounded-lg border border-borde bg-tarjeta px-2 py-1 text-sm text-tinta placeholder:text-tinta-suave"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            Ritmo
          </span>
          <input
            name="ritmo"
            defaultValue={ritmo ?? ""}
            placeholder="90 min + 30 s"
            className="w-full rounded-lg border border-borde bg-tarjeta px-2 py-1 text-sm text-tinta placeholder:text-tinta-suave"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
          Enlace a las bases
        </span>
        <input
          name="urlBases"
          type="url"
          defaultValue={urlBases ?? ""}
          placeholder="https://…"
          className="w-full rounded-lg border border-borde bg-tarjeta px-2 py-1 text-sm text-tinta placeholder:text-tinta-suave"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
          Más información
        </span>
        <textarea
          name="infoExtra"
          rows={3}
          defaultValue={infoExtra ?? ""}
          placeholder="Inscripción, premios, contacto…"
          className="w-full rounded-lg border border-borde bg-tarjeta px-2 py-1 text-sm text-tinta placeholder:text-tinta-suave"
        />
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-semibold text-sobre-acento disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="rounded-xl border border-borde px-3 py-1.5 text-sm text-tinta-suave disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
