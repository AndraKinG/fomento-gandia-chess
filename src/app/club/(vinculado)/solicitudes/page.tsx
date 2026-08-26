import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { ListaSolicitudes, type SolicitudVista } from "./ListaSolicitudes";
import { Contenedor } from "@/components/ui/Contenedor";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { FormularioFichaManual } from "@/components/club/FormularioFichaManual";

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
      <Contenedor medida="panel" className="space-y-4">
        <ListaSolicitudes pendientes={pendientes} resueltas={resueltas} />

        {/* DAR DE ALTA LA FICHA, AQUÍ Y NO SOLO EN ADMIN. Aprobar una solicitud y crear
            la ficha del socio nuevo son el mismo trabajo seguido, y esta es la pantalla
            de la junta —que no entra en `/club/admin`—, así que tenerlo solo allí hacía
            que dar de alta a alguien dependiera del propietario. Va en un `details`
            cerrado porque casi siempre no hace falta: la sincronización del fin de
            semana trae solas las fichas en cuanto la FACV publica al socio. */}
        <Tarjeta>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-tinta">
              Crear la ficha de un socio nuevo
              <span
                aria-hidden
                className="shrink-0 text-tinta-suave transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <p className="mt-2 text-sm text-tinta-suave">
              Normalmente no hace falta: cada domingo y lunes se sincroniza el orden de
              fuerza de la FACV y las fichas nuevas entran solas, con aviso a la junta.
              Esto es para el hueco de semanas entre que alguien entra al club y la FACV
              lo publica — sin ficha no puede vincular su cuenta.
            </p>
            <p className="mt-2 text-sm text-tinta-suave">
              Cuando la FACV lo publique, la sincronización{" "}
              <b className="font-semibold">funde esta ficha con la oficial</b>. Si sabes su
              ID FIDE, ponlo.
            </p>
            <div className="mt-3">
              <FormularioFichaManual volverA="/club/socios" />
            </div>
          </details>
        </Tarjeta>
      </Contenedor>
    </main>
  );
}
