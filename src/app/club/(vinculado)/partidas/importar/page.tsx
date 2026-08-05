import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Importador } from "./Importador";

export default async function ImportarPage() {
  const sesion = await sesionActual();
  if (!sesion?.playerId) redirect("/club/vincular");

  const supabase = await createServerSupabase();
  const { data: ficha } = await supabase
    .from("players")
    .select("nombre")
    .eq("id", sesion.playerId)
    .single();

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Importar partidas"
        subtitulo="Desde Lichess, Chess.com o cualquier PGN"
        volverA="/club/partidas"
      />
      <div className="mx-auto max-w-md p-4 sm:max-w-2xl">
        <Importador miNombre={ficha?.nombre ?? ""} />
      </div>
    </main>
  );
}
