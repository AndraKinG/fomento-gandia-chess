"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { cambiarRol } from "./actions";
import type { Rol } from "@/lib/auth/sesion";

export type SocioConRoles = {
  profileId: string;
  email: string;
  /** Nombre de su ficha del club, si tiene una vinculada. */
  ficha: string | null;
  esJunta: boolean;
  esAdmin: boolean;
  /** Es admin por la columna antigua y no por rol: hay que migrarlo. */
  adminPorColumnaVieja: boolean;
  /** Equipos que capitanea esta temporada. Rango por equipo, no global. */
  capitanDe: string[];
  esYo: boolean;
};

export function ListaRoles({ socios }: { socios: SocioConRoles[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function alternar(profileId: string, rol: Rol, teniendolo: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await cambiarRol(profileId, rol, !teniendolo);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <Banner tipo="error">{error}</Banner>}

      <Tarjeta compacta>
        <p className="text-sm text-tinta">
          Los rangos <b className="font-semibold">se suman</b>: si alguno te permite
          algo, puedes.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-tinta-suave">
          <li>
            <b className="font-semibold">Jugador</b> no se reparte aquí: lo es todo
            socio con cuenta y ficha vinculada.
          </li>
          <li>
            <b className="font-semibold">Capitán</b> tampoco: se nombra por equipo y
            temporada en <span className="font-mono">Equipos y capitanes</span>.
          </li>
        </ul>
      </Tarjeta>

      {socios.map((s) => (
        <Tarjeta key={s.profileId}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-tinta">
                {s.ficha ?? s.email}
                {s.esYo && (
                  <span className="ml-2 text-xs font-normal text-tinta-suave">(tú)</span>
                )}
              </p>
              {s.ficha && <p className="truncate text-sm text-tinta-suave">{s.email}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {s.ficha ? (
                  <Etiqueta>Jugador</Etiqueta>
                ) : (
                  <Etiqueta apagada>Sin ficha</Etiqueta>
                )}
                {s.capitanDe.map((e) => (
                  <Etiqueta key={e}>Capitán {e}</Etiqueta>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Interruptor
                activo={s.esJunta}
                deshabilitado={pendiente}
                onClick={() => alternar(s.profileId, "junta", s.esJunta)}
              >
                Junta
              </Interruptor>
              <Interruptor
                activo={s.esAdmin}
                deshabilitado={pendiente}
                onClick={() => alternar(s.profileId, "admin", s.esAdmin)}
              >
                Admin
              </Interruptor>
            </div>
          </div>

          {s.adminPorColumnaVieja && (
            <p className="mt-2 text-xs text-tinta-suave">
              Es admin por la columna antigua de la base de datos. Al quitárselo se
              limpian las dos fuentes.
            </p>
          )}
        </Tarjeta>
      ))}

      {socios.length === 0 && (
        <Tarjeta compacta>
          <p className="text-sm text-tinta-suave">Todavía no hay cuentas en el club.</p>
        </Tarjeta>
      )}
    </div>
  );
}

function Etiqueta({
  children,
  apagada = false,
}: {
  children: React.ReactNode;
  apagada?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
        apagada
          ? "bg-tarjeta text-tinta-suave ring-borde"
          : "bg-tarjeta-suave text-acento-texto ring-borde-acento"
      }`}
    >
      {children}
    </span>
  );
}

function Interruptor({
  activo,
  deshabilitado,
  onClick,
  children,
}: {
  activo: boolean;
  deshabilitado: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-pressed={activo}
      className={`w-24 rounded-xl px-3 py-1.5 text-xs font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-50 ${
        activo
          ? "bg-acento-fuerte text-sobre-acento"
          : "border border-borde bg-tarjeta text-tinta-suave"
      }`}
    >
      {activo ? `✓ ${children}` : children}
    </button>
  );
}
