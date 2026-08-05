import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { hoyISO } from "@/lib/torneos/fechas";
import { FormularioPartida } from "../FormularioPartida";
import { cargarOpciones } from "../opciones";

export default async function NuevaPartidaPage() {
  const sesion = await sesionActual();
  if (!sesion?.playerId) redirect("/club/vincular");

  const supabase = await createServerSupabase();
  const { torneos, socios } = await cargarOpciones(supabase, sesion.playerId);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Subir una partida"
        subtitulo="Los datos son lo importante; el PGN, si lo tienes"
        volverA="/club/partidas"
      />
      <div className="mx-auto max-w-md p-4 sm:max-w-2xl">
        <FormularioPartida
          torneos={torneos}
          socios={socios}
          // Solo para que la fecha arranque en hoy, que es el caso normal: se
          // sube la partida el mismo día o al día siguiente.
          inicial={{
            id: "",
            fecha: hoyISO(),
            ronda: "",
            rivalNombre: "",
            rivalId: "",
            rivalElo: "",
            miElo: "",
            color: "blancas",
            resultado: "1",
            tournamentId: "",
            torneoTexto: "",
            apertura: "",
            notas: "",
            pgn: "",
          }}
        />
      </div>
    </main>
  );
}
