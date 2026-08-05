"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { exportarMisPartidas } from "./importar/actions";

/**
 * Descarga las partidas propias como un fichero `.pgn`.
 *
 * El PGN se construye en el servidor a partir de los datos guardados, no
 * concatenando los PGN originales: así también salen bien las partidas que se
 * metieron a mano en el tablero, que no tenían cabeceras, y el fichero vale para
 * subirlo a Lichess o Chess.com.
 */
export function Exportar() {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      {error && <Banner tipo="error">{error}</Banner>}
      <Boton
        variante="secundario"
        className="w-full text-sm"
        disabled={pendiente}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await exportarMisPartidas();
            if (r.error || !r.pgn) {
              setError(r.error ?? "No se pudo exportar.");
              return;
            }
            // Descarga en el navegador con un enlace temporal: no hace falta que
            // el servidor sirva un fichero ni guardarlo en ninguna parte.
            const blob = new Blob([r.pgn], { type: "application/x-chess-pgn" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "mis-partidas.pgn";
            a.click();
            URL.revokeObjectURL(url);
          });
        }}
      >
        {pendiente ? "Preparando…" : "Descargar mis partidas (.pgn)"}
      </Boton>
    </div>
  );
}
