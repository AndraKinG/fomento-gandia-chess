import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { FormularioTorneoInterno } from "./FormularioTorneoInterno";
import { Contenedor } from "@/components/ui/Contenedor";

export default async function NuevoTorneoInternoPage() {
  const sesion = await sesionActual();
  // La RLS ya impide escribir a quien no es junta; esto evita enseñar un
  // formulario que al guardar no iba a funcionar.
  if (!sesion?.esJunta) redirect("/club/interno");

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Nuevo torneo interno"
        subtitulo="Después se inscriben los jugadores"
        volverA="/club/interno" medida="formulario"
      />
      <Contenedor medida="formulario">
        <FormularioTorneoInterno />
      </Contenedor>
    </main>
  );
}
