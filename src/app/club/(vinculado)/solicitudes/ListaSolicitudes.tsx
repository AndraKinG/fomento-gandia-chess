"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { resolverSolicitud } from "./actions";

export type SolicitudVista = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  mensaje: string | null;
  fecha: string;
  estado: "pendiente" | "aceptada" | "rechazada";
  revisadaPor: string | null;
  notas: string | null;
};

export function ListaSolicitudes({
  pendientes,
  resueltas,
}: {
  pendientes: SolicitudVista[];
  resueltas: SolicitudVista[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function resolver(id: string, estado: "aceptada" | "rechazada", notas: string) {
    setError(null);
    startTransition(async () => {
      const r = await resolverSolicitud(id, estado, notas);
      if (r.error) {
        setError(r.error);
        return;
      }
      setAbierta(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <Banner tipo="error">{error}</Banner>}

      {pendientes.length === 0 && (
        <EstadoVacio
          icono="✉️"
          titulo="No hay solicitudes pendientes"
          detalle="Aquí aparecerá quien pida entrar en el club desde la web pública."
        />
      )}

      {pendientes.map((s) => (
        <Tarjeta key={s.id} destacada>
          <p className="font-semibold text-tinta">{s.nombre}</p>
          <p className="mt-0.5 text-xs text-tinta-suave">{s.fecha}</p>

          <div className="mt-2 space-y-1 text-sm">
            <p className="text-tinta">
              <a href={`mailto:${s.email}`} className="text-acento-texto underline">
                {s.email}
              </a>
            </p>
            {s.telefono && (
              <p className="text-tinta">
                <a href={`tel:${s.telefono.replace(/\s/g, "")}`} className="text-acento-texto underline">
                  {s.telefono}
                </a>
              </p>
            )}
          </div>

          {s.mensaje && (
            <p className="mt-3 whitespace-pre-line rounded-xl bg-tarjeta p-3 text-sm text-tinta">
              {s.mensaje}
            </p>
          )}

          {abierta === s.id ? (
            <form
              className="mt-3 flex flex-col gap-2 border-t border-borde pt-3"
              action={(fd) => {
                const estado = String(fd.get("decision")) as "aceptada" | "rechazada";
                resolver(s.id, estado, String(fd.get("notas") ?? ""));
              }}
            >
              <label htmlFor={`notas-${s.id}`} className="text-sm text-tinta">
                Nota interna (opcional)
              </label>
              <input
                id={`notas-${s.id}`}
                name="notas"
                type="text"
                placeholder="Hablado por teléfono, viene el jueves"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-sm text-tinta placeholder:text-tinta-suave"
              />
              <p className="text-xs text-tinta-suave">
                Aceptar solo deja constancia: no crea cuenta ni ficha. Después hay
                que hablar con la persona, la cuota, y darle el código del club.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="aceptada"
                  disabled={pendiente}
                  className="flex-1 rounded-xl bg-acento-fuerte p-3 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                >
                  Aceptar
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="rechazada"
                  disabled={pendiente}
                  className="rounded-xl border border-borde bg-tarjeta p-3 text-sm text-tinta-suave transition duration-100 hover:bg-tarjeta-suave active:scale-[0.97] disabled:opacity-50"
                >
                  Rechazar
                </button>
                <Boton
                  variante="secundario"
                  onClick={() => setAbierta(null)}
                  disabled={pendiente}
                  className="text-sm"
                >
                  Cancelar
                </Boton>
              </div>
            </form>
          ) : (
            <div className="mt-3">
              <Boton
                variante="solido"
                onClick={() => setAbierta(s.id)}
                className="px-4 py-2 text-sm"
              >
                Resolver
              </Boton>
            </div>
          )}
        </Tarjeta>
      ))}

      {resueltas.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="px-1 text-xs uppercase tracking-wide text-tinta-suave">
            Ya resueltas
          </p>
          {resueltas.map((s) => (
            <Tarjeta key={s.id} compacta>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-tinta">{s.nombre}</p>
                  <p className="truncate text-xs text-tinta-suave">{s.email}</p>
                  {s.notas && (
                    <p className="mt-1 text-xs text-tinta-suave">{s.notas}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                    s.estado === "aceptada"
                      ? "bg-tarjeta-suave text-acento-texto ring-borde-acento"
                      : "bg-tarjeta text-tinta-suave ring-borde"
                  }`}
                >
                  {s.estado === "aceptada" ? "Aceptada" : "Rechazada"}
                </span>
              </div>
              {s.revisadaPor && (
                <p className="mt-1 text-xs text-tinta-suave">Por {s.revisadaPor}</p>
              )}
            </Tarjeta>
          ))}
        </div>
      )}
    </div>
  );
}
