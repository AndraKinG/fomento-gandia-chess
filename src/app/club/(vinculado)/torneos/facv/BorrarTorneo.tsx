"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { borrarTorneoManual } from "./actions";

/**
 * Deshacer un torneo creado a mano, desde el propio torneo.
 *
 * POR QUÉ AQUÍ Y NO SOLO EN EL PANEL DE ADMIN: borrar existía escondido dentro del
 * formulario de editar del panel, y solo para admin. Quien se equivoca al crear un
 * torneo está mirando el torneo que acaba de crear, y ahí es donde tiene que estar el
 * arreglo — un torneo mal escrito lo ve el club entero en su lista.
 *
 * DOS PULSACIONES, y la segunda dice qué se lleva por delante. Un botón de borrar de
 * un solo toque en la pantalla que más se visita del torneo es una trampa.
 */
export function BorrarTorneo({
  tournamentId,
  cuantosVan,
}: {
  tournamentId: string;
  /** Gente apuntada: se va con el torneo, así que hay que decirlo antes. */
  cuantosVan: number;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-sm text-tinta-suave underline"
      >
        Borrar este torneo
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {error && <Banner tipo="error">{error}</Banner>}
      <p className="text-sm text-tinta">
        ¿Borrar el torneo?
        {cuantosVan > 0
          ? ` Se quitará también a ${cuantosVan} ${
              cuantosVan === 1 ? "persona apuntada" : "personas apuntadas"
            } y sus coches.`
          : " No se puede deshacer."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Boton
          variante="secundario"
          className="text-sm"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await borrarTorneoManual(tournamentId);
              if (r.error) {
                setError(r.error);
                return;
              }
              router.push("/club/torneos/facv");
            })
          }
        >
          {pendiente ? "Borrando…" : "Sí, borrar"}
        </Boton>
        <Boton
          variante="secundario"
          className="text-sm"
          disabled={pendiente}
          onClick={() => setConfirmando(false)}
        >
          No
        </Boton>
      </div>
    </div>
  );
}
