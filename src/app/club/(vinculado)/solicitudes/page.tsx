import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { ListaSolicitudes, type SolicitudVista } from "./ListaSolicitudes";
import { Contenedor } from "@/components/ui/Contenedor";

/**
 * Solicitudes de ingreso al club.
 *
 * Vive en la zona de socios y no en `/club/admin` porque quien la usa es la
 * **junta**, que no tiene acceso a la administración. La policy de
 * `membership_requests` (migración 0013) solo deja leer a junta y admin, así que
 * la RLS es la barrera de verdad; el redirect de aquí es para no enseñar una
 * pantalla vacía a quien no le toca.
 */
export default async function SolicitudesPage() {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) redirect("/club");

  const supabase = await createServerSupabase();
  const { data: filas } = await supabase
    .from("membership_requests")
    .select("id, nombre, email, telefono, mensaje, estado, notas_internas, created_at, revisada_at, profiles(email)")
    .order("created_at", { ascending: false })
    .limit(100);

  const aVista = (f: NonNullable<typeof filas>[number]): SolicitudVista => ({
    id: f.id,
    nombre: f.nombre,
    email: f.email,
    telefono: f.telefono,
    mensaje: f.mensaje,
    fecha: formatearFechaMadrid(f.created_at, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    estado: f.estado as SolicitudVista["estado"],
    revisadaPor: (f.profiles as unknown as { email: string } | null)?.email ?? null,
    notas: f.notas_internas,
  });

  const todas = (filas ?? []).map(aVista);
  const pendientes = todas.filter((s) => s.estado === "pendiente");
  const resueltas = todas.filter((s) => s.estado !== "pendiente");

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Solicitudes de ingreso"
        subtitulo={
          pendientes.length > 0
            ? `${pendientes.length} sin resolver`
            : "Quien quiere entrar en el club"
        }
        volverA="/club" medida="panel"
      />
      <Contenedor medida="panel">
        <ListaSolicitudes pendientes={pendientes} resueltas={resueltas} />
      </Contenedor>
    </main>
  );
}
