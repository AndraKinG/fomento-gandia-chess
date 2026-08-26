"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarActivoSocio } from "@/app/club/(vinculado)/admin/orden-fuerza/actions";

/**
 * Dar de baja a un socio que se ha ido del club, o volver a activarlo.
 *
 * NO DICE "BORRAR" PORQUE NO BORRA, y la diferencia importa: la ficha se queda con todas
 * sus partidas, actas y resultados. Borrarla de verdad se los llevaría por delante
 * (`games.player_id` está en cascada), y quien se fue del club sigue siendo parte de su
 * historia.
 *
 * DOS PASOS PARA LA BAJA Y UNO PARA REACTIVAR: dar de baja saca a alguien de las listas
 * donde se juega, así que conviene pararse a leerlo; volver a activarlo no rompe nada y
 * pedir confirmación para eso solo estorba.
 */
export function BajaSocio({
  playerId,
  nombre,
  activo,
}: {
  playerId: string;
  nombre: string;
  activo: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function cambiar(a: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await cambiarActivoSocio(playerId, a);
      if (r.error) {
        setError(r.error);
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  if (!activo) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-tinta">
          <b className="font-semibold">Está de baja.</b> No sale en ninguna lista del
          club: solo se llega a esta ficha por su enlace directo.
        </p>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => cambiar(true)}
          className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-semibold text-sobre-acento disabled:opacity-50"
        >
          {pendiente ? "Activando…" : "Volver a activarlo"}
        </button>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (!confirmando) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setConfirmando(true)}
          className="rounded-xl border border-borde px-3 py-1.5 text-sm text-tinta-suave hover:bg-tarjeta-suave disabled:opacity-50"
        >
          Dar de baja
        </button>
        <p className="text-xs text-tinta-suave">Si ya no es del club.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* DECIR LAS DOS MITADES: lo que se va y lo que se queda. Sin la segunda, "dar de
          baja" suena a borrar y nadie se atreve a pulsarlo. */}
      <p className="text-sm text-tinta">
        ¿Dar de baja a {nombre}? Deja de verlo todo el mundo: desaparece de los socios,
        del orden de fuerza, de los retos, de las inscripciones y de las plantillas.
      </p>
      <p className="text-xs text-tinta-suave">
        No se borra nada: sus partidas, sus actas y su fila del documento de la FACV
        siguen guardadas. Si algún día vuelve, se reactiva con todo su historial.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => cambiar(false)}
          className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-semibold text-sobre-acento disabled:opacity-50"
        >
          {pendiente ? "Dando de baja…" : "Sí, darlo de baja"}
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setConfirmando(false)}
          className="rounded-xl border border-borde px-3 py-1.5 text-sm text-tinta-suave disabled:opacity-50"
        >
          No
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
