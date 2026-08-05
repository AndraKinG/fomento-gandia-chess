"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { borrarPartida } from "../actions";

/**
 * Borrar una partida propia, con confirmación en dos pasos.
 *
 * No hay forma de recuperarla —ni las anotaciones ni el PGN—, así que un solo
 * toque no puede ser suficiente: el botón de borrar queda justo debajo del de
 * editar en una pantalla de móvil.
 */
export function AccionesPartida({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  if (!confirmando) {
    return (
      <Boton
        variante="secundario"
        onClick={() => setConfirmando(true)}
        className="text-sm"
      >
        Borrar
      </Boton>
    );
  }

  return (
    <div className="w-full space-y-2">
      {error && <Banner tipo="error">{error}</Banner>}
      <Banner tipo="aviso">
        ¿Seguro? Se borran también las anotaciones y el PGN, y no hay vuelta atrás.
      </Banner>
      <div className="flex gap-2">
        <Boton
          variante="solido"
          disabled={pendiente}
          className="flex-1 text-sm"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await borrarPartida(id);
              if (r.error) {
                setError(r.error);
                return;
              }
              router.push("/club/partidas");
            });
          }}
        >
          {pendiente ? "Borrando…" : "Sí, borrar"}
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => setConfirmando(false)}
          disabled={pendiente}
          className="text-sm"
        >
          No
        </Boton>
      </div>
    </div>
  );
}
