import { createServerSupabase } from "@/lib/supabase/server";
import { solicitarVinculo } from "./actions";

export default async function VincularPage() {
  const supabase = await createServerSupabase();
  const { data: players } = await supabase
    .from("players")
    .select("id, nombre, elo_fide, elo_feda")
    .eq("activo", true)
    .order("nombre");
  const { data: vinculados } = await supabase
    .from("profiles").select("player_id").not("player_id", "is", null);
  const ocupados = new Set((vinculados ?? []).map((v) => v.player_id));
  const libres = (players ?? []).filter((p) => !ocupados.has(p.id));

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">¿Quién eres?</h1>
      <p className="mt-1 text-sm text-gray-600">
        Busca tu nombre en la lista del club. El admin confirmará tu vinculación.
      </p>
      <ul className="mt-4 space-y-2">
        {libres.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded border p-3">
            <span>
              {p.nombre}
              <span className="ml-2 text-xs text-gray-500">
                FIDE {p.elo_fide ?? "—"}
              </span>
            </span>
            <form
              action={async () => {
                "use server";
                await solicitarVinculo(p.id);
              }}
            >
              <button className="rounded bg-black px-3 py-1 text-sm text-white">
                Soy yo
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
