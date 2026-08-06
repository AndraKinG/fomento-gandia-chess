import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { hoyISO } from "@/lib/torneos/fechas";
import { FormularioPartida } from "../FormularioPartida";
import { cargarOpciones } from "../opciones";
import { inicialDesdeEmparejamiento } from "./desdeEmparejamiento";

export default async function NuevaPartidaPage({
  searchParams,
}: {
  searchParams: Promise<{ emparejamiento?: string }>;
}) {
  const { emparejamiento } = await searchParams;
  const sesion = await sesionActual();
  if (!sesion?.playerId) redirect("/club/vincular");

  const supabase = await createServerSupabase();
  const { torneos, socios } = await cargarOpciones(supabase, sesion.playerId);

  // Si viene de un torneo interno, se rellena con lo que la app ya sabe.
  const desdeTorneo = emparejamiento
    ? await inicialDesdeEmparejamiento(supabase, emparejamiento, sesion.playerId)
    : null;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Subir una partida"
        subtitulo={
          desdeTorneo
            ? `De ${desdeTorneo.nombreTorneo}`
            : "Los datos son lo importante; el PGN, si lo tienes"
        }
        volverA="/club/partidas"
      />
      <div className="mx-auto max-w-md space-y-4 p-4 sm:max-w-2xl">
        {desdeTorneo && (
          <Banner tipo="ok">
            Rellenado con los datos del torneo: rival, color, resultado y ronda. Solo
            te faltan las jugadas.
          </Banner>
        )}
        {emparejamiento && !desdeTorneo && (
          <Banner tipo="aviso">
            No se ha podido cargar esa partida del torneo. Puede que no sea tuya.
          </Banner>
        )}

        <FormularioPartida
          torneos={torneos}
          socios={socios}
          pairingId={desdeTorneo ? emparejamiento : undefined}
          inicial={
            desdeTorneo?.inicial ?? {
              id: "",
              // Solo para que la fecha arranque en hoy, que es el caso normal: se
              // sube la partida el mismo día o al día siguiente.
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
            }
          }
        />
      </div>
    </main>
  );
}
