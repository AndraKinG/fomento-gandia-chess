import { createServerSupabase } from "@/lib/supabase/server";
import { aprobarVinculo, rechazarVinculo } from "./actions";

export default async function VinculacionesPage() {
  const supabase = await createServerSupabase();
  const { data: pendientes } = await supabase
    .from("link_requests")
    .select("id, created_at, profiles(email), players(nombre)")
    .eq("status", "pendiente")
    .order("created_at");

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Vinculaciones pendientes</h1>
      <ul className="mt-4 space-y-2">
        {(pendientes ?? []).map((r) => {
          const email = (r.profiles as unknown as { email: string }).email;
          const nombre = (r.players as unknown as { nombre: string }).nombre;
          return (
            <li key={r.id} className="rounded border p-3 text-sm">
              <p><b>{email}</b> dice ser <b>{nombre}</b></p>
              <div className="mt-2 flex gap-2">
                <form action={aprobarVinculo.bind(null, r.id)}>
                  <button className="rounded bg-green-600 px-3 py-1 text-white">
                    Aprobar
                  </button>
                </form>
                <form action={rechazarVinculo.bind(null, r.id)}>
                  <button className="rounded border px-3 py-1">Rechazar</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      {(pendientes ?? []).length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No hay solicitudes pendientes.</p>
      )}
    </main>
  );
}
