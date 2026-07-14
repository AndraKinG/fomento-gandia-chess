import { createServerSupabase } from "@/lib/supabase/server";
import { fuerza } from "@/lib/elo/fuerza";
import { logout } from "../(auth)/actions";

export default async function PerfilPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, player_id, players(nombre, elo_fide, elo_feda, elo_otro, fide_id, feda_id)")
    .eq("id", user!.id)
    .single();
  const p = profile?.players as unknown as {
    nombre: string; elo_fide: number | null; elo_feda: number | null;
    elo_otro: number | null; fide_id: string | null; feda_id: string | null;
  } | null;

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Mi perfil</h1>
      <p className="text-sm text-gray-600">{profile?.email}</p>
      {p ? (
        <div className="mt-4 rounded-lg border p-4">
          <p className="text-lg font-semibold">{p.nombre}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt>ELO FIDE</dt><dd className="text-right">{p.elo_fide ?? "—"}</dd>
            <dt>ELO FEDA</dt><dd className="text-right">{p.elo_feda ?? "—"}</dd>
            <dt className="font-semibold">Fuerza (RGC 52.1)</dt>
            <dd className="text-right font-semibold">
              {fuerza({ eloFide: p.elo_fide, eloFeda: p.elo_feda, eloOtro: p.elo_otro })}
            </dd>
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-sm">Sin ficha vinculada todavía.</p>
      )}
      <form action={logout}>
        <button className="mt-6 rounded border p-2 text-sm">Cerrar sesión</button>
      </form>
    </main>
  );
}
