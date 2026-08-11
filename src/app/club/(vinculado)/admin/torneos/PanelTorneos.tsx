"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import {
  borrarTorneo,
  cambiarDeInteres,
  editarFichaTorneo,
  sincronizarTorneos,
} from "./actions";

export type TorneoAdmin = {
  id: string;
  nombre: string;
  /** ISO, para agrupar por mes. */
  fechaInicio: string;
  rango: string;
  lugar: string | null;
  organizador: string | null;
  hora: string | null;
  ritmo: string | null;
  infoExtra: string | null;
  urlBases: string | null;
  deInteres: boolean;
  esManual: boolean;
  /** Cuántos han dicho que van, para que el admin vea de un vistazo si cuaja. */
  van: number;
  sinPlaza: number;
  plazasLibres: number;
};

/** "agosto 2026" a partir del ISO, para las cabeceras de la agenda. */
function mesDe(fechaIso: string): string {
  return new Date(`${fechaIso}T00:00:00`).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
}

export function PanelTorneos({ torneos }: { torneos: TorneoAdmin[] }) {
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error" | "aviso"; texto: string } | null>(
    null
  );
  const [editando, setEditando] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function ejecutar(accion: () => Promise<{ error?: string }>, exito?: string) {
    setAviso(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) {
        setAviso({ tipo: "error", texto: r.error });
        return;
      }
      if (exito) setAviso({ tipo: "ok", texto: exito });
      setEditando(null);
      router.refresh();
    });
  }

  function sincronizar() {
    setAviso(null);
    startTransition(async () => {
      const r = await sincronizarTorneos();
      setAviso(
        r.error
          ? { tipo: "error", texto: r.error }
          : {
              tipo: "ok",
              texto: `Sincronizado: ${r.creados} nuevos, ${r.actualizados} actualizados.`,
            }
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {aviso && <Banner tipo={aviso.tipo}>{aviso.texto}</Banner>}

      <Tarjeta>
        <p className="text-sm text-tinta">
          Trae el calendario oficial de la FACV. Los torneos nuevos entran sin marcar;
          tú eliges a cuáles va el club.
        </p>
        <p className="mt-1 text-xs text-tinta-suave">
          No pisa la hora, el ritmo, la información extra ni las bases que hayas
          escrito, ni los torneos que hayas creado a mano.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton variante="solido" onClick={sincronizar} disabled={pendiente}>
            {pendiente ? "Trabajando…" : "Sincronizar con la FACV"}
          </Boton>
        </div>
      </Tarjeta>

      {torneos.length === 0 && (
        <Tarjeta compacta>
          <p className="text-sm text-tinta-suave">
            No hay torneos próximos. Sincroniza con la FACV para traer el calendario.
          </p>
        </Tarjeta>
      )}

      {/* AGENDA POR MESES y no 50 tarjetas apiladas (petición del propietario):
          es el patrón de referencia de la app, el calendario de Interclubs — una
          caja por mes con una fila por torneo. Los marcados van resaltados, no
          reordenados: en una agenda manda la fecha. */}
      {(() => {
        const meses = new Map<string, TorneoAdmin[]>();
        for (const t of torneos) {
          const clave = mesDe(t.fechaInicio);
          meses.set(clave, [...(meses.get(clave) ?? []), t]);
        }
        return [...meses.entries()].map(([mes, delMes]) => (
          <section key={mes} className="space-y-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              {mes}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
              <ul className="divide-y divide-borde">
                {delMes.map((t) => (
                  <li key={t.id} className={t.deInteres ? "bg-tarjeta-suave" : ""}>
                    <div className="flex items-center gap-3 px-3 py-2">
                      <span className="w-24 shrink-0 text-xs text-tinta-suave">{t.rango}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-tinta">
                          {t.deInteres && <span aria-hidden>★ </span>}
                          <Link href={`/club/torneos/facv/${t.id}`} className="hover:underline">
                            {t.nombre}
                          </Link>
                        </p>
                        <p className="truncate text-xs text-tinta-suave">
                          {t.lugar ?? ""}
                          {t.deInteres &&
                            ` · ${t.van} ${t.van === 1 ? "va" : "van"}` +
                              (t.sinPlaza > 0
                                ? ` · ${t.sinPlaza} sin coche, ${t.plazasLibres} ${t.plazasLibres === 1 ? "plaza" : "plazas"} libres`
                                : " · transporte cubierto")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() =>
                            ejecutar(
                              () => cambiarDeInteres(t.id, !t.deInteres),
                              t.deInteres ? "Quitado de la lista del club." : "Marcado y avisado al club."
                            )
                          }
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-50 ${
                            t.deInteres
                              ? "bg-acento-fuerte text-sobre-acento"
                              : "border border-borde bg-tarjeta text-tinta-suave"
                          }`}
                        >
                          {t.deInteres ? "★ Vamos" : "Marcar"}
                        </button>
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() => setEditando(editando === t.id ? null : t.id)}
                          aria-expanded={editando === t.id}
                          className="rounded-lg border border-borde bg-tarjeta px-2.5 py-1 text-xs text-tinta-suave transition duration-100 active:scale-[0.97] disabled:opacity-50"
                        >
                          Ficha
                        </button>
                      </div>
                    </div>

                    {editando === t.id && (
                      <form
                        className="flex flex-col gap-3 border-t border-borde px-3 pb-3 pt-3"
                        action={(fd) =>
                          ejecutar(
                            () =>
                              editarFichaTorneo(t.id, {
                                hora: String(fd.get("hora") ?? ""),
                                ritmo: String(fd.get("ritmo") ?? ""),
                                infoExtra: String(fd.get("infoExtra") ?? ""),
                                urlBases: String(fd.get("urlBases") ?? ""),
                              }),
                            "Ficha guardada."
                          )
                        }
                      >
                        <p className="text-xs text-tinta-suave">
                          Esto no lo publica la FACV: lo rellenas tú y el re-sync no lo toca.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <Campo id="hora" etiqueta="Hora" valor={t.hora} marcador="09:30" />
                          <Campo id="ritmo" etiqueta="Ritmo" valor={t.ritmo} marcador="blitz" />
                        </div>
                        <Campo
                          id="urlBases"
                          etiqueta="Enlace a las bases"
                          valor={t.urlBases}
                          marcador="https://…"
                        />
                        <Campo
                          id="infoExtra"
                          etiqueta="Información extra"
                          valor={t.infoExtra}
                          marcador="Inscripción media hora antes"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Boton variante="solido" type="submit" disabled={pendiente} className="flex-1">
                            Guardar
                          </Boton>
                          <Boton
                            variante="secundario"
                            onClick={() => setEditando(null)}
                            disabled={pendiente}
                          >
                            Cancelar
                          </Boton>
                          {t.esManual && (
                            <Boton
                              variante="secundario"
                              disabled={pendiente}
                              onClick={() => ejecutar(() => borrarTorneo(t.id), "Torneo borrado.")}
                            >
                              Borrar torneo
                            </Boton>
                          )}
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ));
      })()}
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  marcador,
  tipo = "text",
  requerido = false,
}: {
  id: string;
  etiqueta: string;
  valor?: string | null;
  marcador?: string;
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
        defaultValue={valor ?? ""}
        placeholder={marcador}
        className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
      />
    </div>
  );
}
