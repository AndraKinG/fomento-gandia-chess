import { createServerSupabase } from "@/lib/supabase/server";
import { aprobarVinculo, rechazarVinculo } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor } from "@/components/ui/Contenedor";
import { BotonAccion } from "@/components/ui/BotonAccion";

export default async function VinculacionesPage() {
  const supabase = await createServerSupabase();
  const { data: pendientes } = await supabase
    .from("link_requests")
    .select("id, created_at, profiles(email), players(nombre)")
    .eq("status", "pendiente")
    .order("created_at");

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Vinculaciones pendientes" volverA="/club/admin" medida="panel" />
      <Contenedor medida="panel" className="space-y-3">
        {(pendientes ?? []).map((r) => {
          const email = (r.profiles as unknown as { email: string }).email;
          const nombre = (r.players as unknown as { nombre: string }).nombre;
          return (
            <Tarjeta key={r.id}>
              <p className="text-sm text-tinta">
                <b className="font-semibold">{email}</b> dice ser{" "}
                <b className="font-semibold">{nombre}</b>
              </p>
              <div className="mt-3 flex gap-2">
                {/* Un formulario por botón, así que cada `BotonAccion` ve solo su
                    propio envío: al aprobar no se deshabilita el de rechazar. */}
                <form action={aprobarVinculo.bind(null, r.id)}>
                  <BotonAccion
                    variante="solido"
                    trabajando="Aprobando…"
                    className="px-3 py-1.5 text-sm font-medium"
                  >
                    Aprobar
                  </BotonAccion>
                </form>
                <form action={rechazarVinculo.bind(null, r.id)}>
                  <BotonAccion
                    variante="secundario"
                    trabajando="Rechazando…"
                    className="px-3 py-1.5 text-sm font-medium"
                  >
                    Rechazar
                  </BotonAccion>
                </form>
              </div>
            </Tarjeta>
          );
        })}
        {(pendientes ?? []).length === 0 && (
          <EstadoVacio titulo="No hay solicitudes pendientes" />
        )}
      </Contenedor>
    </main>
  );
}
