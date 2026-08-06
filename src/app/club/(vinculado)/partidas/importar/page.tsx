import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Importador } from "./Importador";
import { Contenedor } from "@/components/ui/Contenedor";

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
        volverA="/club/partidas" medida="formulario"
      />
      <Contenedor medida="formulario">
        <Importador miNombre={ficha?.nombre ?? ""} />
      </Contenedor>
    </main>
  );
}
