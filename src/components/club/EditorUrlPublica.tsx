"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ponerUrlPublica } from "@/app/club/(vinculado)/jugar/torneos/actions";

/**
 * El enlace público del torneo en ChessPairings, para pegarlo o cambiarlo.
 *
 * POR QUÉ HACE FALTA PODER PONERLO DESPUÉS: lo normal es crear el torneo aquí para que
 * la gente se apunte y montarlo en ChessPairings más tarde, así que al crearlo la página
 * pública todavía no existe. Sin esto había que borrar el torneo y volver a crearlo.
 *
 * CON BOTÓN Y NO AL SALIR DEL CAMPO, al contrario que el mote o el ELO estimado: aquí se
 * pega una URL larga, y guardar en cuanto el foco se va es justo lo que rompe un pegado a
 * medias en un móvil.
 */
export function EditorUrlPublica({
  tournamentId,
  urlActual,
}: {
  tournamentId: string;
  urlActual: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(urlActual ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await ponerUrlPublica(tournamentId, valor);
      if (r.error) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 text-xs font-semibold text-acento-texto hover:underline"
      >
        {urlActual ? "Cambiar el enlace" : "Pegar el enlace de ChessPairings"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        type="url"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="https://my.chesspairings.org/pubblico/torneo.php?id=…"
        className="w-full rounded-xl border border-borde bg-tarjeta p-2 text-sm text-tinta placeholder:text-tinta-suave"
      />
      <p className="text-xs text-tinta-suave">
        En ChessPairings, la dirección de la página pública del torneo. Vacío lo quita.
      </p>
      {/* YA NO IMPORTA DE QUIÉN SEA LA CUENTA, y decirlo evita el miedo a probar: la
          clasificación se lee de su PÁGINA PÚBLICA, sin clave, así que el torneo lo puede
          crear quien organice con su propia cuenta. Lo único que hace falta es que allí
          esté marcado como público. */}
      <p className="text-xs text-tinta-suave">
        Lo puede crear cualquiera con su cuenta de ChessPairings. Lo único: que el torneo
        esté marcado como <b className="font-semibold">público</b> allí, o su página no
        enseña nada.
      </p>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={guardar}
          className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-semibold text-sobre-acento disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setValor(urlActual ?? "");
            setAbierto(false);
          }}
          className="rounded-xl border border-borde px-3 py-1.5 text-sm text-tinta-suave disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
