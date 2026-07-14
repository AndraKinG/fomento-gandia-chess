import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { solicitarVinculo } from "./actions";

export default async function VincularPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: players } = await supabase
    .from("players")
    .select("id, nombre, elo_fide, elo_feda")
    .eq("activo", true)
    .order("nombre");

  // RLS en `profiles` solo deja ver la fila propia a un no-admin, así que con el
  // cliente de usuario esta consulta no vería vinculaciones de otras personas.
  // Usamos el cliente admin SOLO para leer `player_id` (ningún otro dato personal
  // sale del servidor) y así calcular qué fichas están ya ocupadas.
  const admin = createAdminClient();
  const [{ data: vinculados }, { data: pendientes }] = await Promise.all([
    admin.from("profiles").select("player_id").not("player_id", "is", null),
    admin.from("link_requests").select("player_id").eq("status", "pendiente"),
  ]);
  const ocupados = new Set([
    ...(vinculados ?? []).map((v) => v.player_id),
    ...(pendientes ?? []).map((r) => r.player_id),
  ]);
  const libres = (players ?? []).filter((p) => !ocupados.has(p.id));

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">¿Quién eres?</h1>
      <p className="mt-1 text-sm text-gray-600">
        Busca tu nombre en la lista del club. El admin confirmará tu vinculación.
      </p>
      {error && (
        <p className="mt-4 rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>
      )}
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
                const r = await solicitarVinculo(p.id);
                if (r?.error) redirect("/vincular?error=" + encodeURIComponent(r.error));
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
