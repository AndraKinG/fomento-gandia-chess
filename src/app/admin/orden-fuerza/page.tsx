import { createServerSupabase } from "@/lib/supabase/server";
import { importarOrdenFuerza } from "./actions";

export default async function OrdenFuerzaPage() {
  const supabase = await createServerSupabase();
  const { data: season } = await supabase
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();
  const { data: orden } = season
    ? await supabase
        .from("force_order")
        .select("numero, bis_index, players(nombre, elo_fide, elo_feda)")
        .eq("season_id", season.id)
        .order("numero").order("bis_index")
    : { data: null };

  async function accion(formData: FormData) {
    "use server";
    await importarOrdenFuerza(
      String(formData.get("season")),
      String(formData.get("texto"))
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Orden de fuerza</h1>
      {orden && orden.length > 0 ? (
        <ol className="mt-4 space-y-1">
          {orden.map((f) => {
            const p = f.players as unknown as {
              nombre: string; elo_fide: number | null; elo_feda: number | null;
            };
            return (
              <li key={`${f.numero}-${f.bis_index}`} className="rounded border p-2 text-sm">
                <b>{f.numero}{f.bis_index ? "bis" : ""}</b> · {p.nombre} ·
                FIDE {p.elo_fide ?? "—"} · FEDA {p.elo_feda ?? "—"}
              </li>
            );
          })}
        </ol>
      ) : (
        <form action={accion} className="mt-4 flex flex-col gap-3">
          <input name="season" required placeholder="Nombre temporada (ej. Interclubs 2027)"
            className="rounded border p-3" />
          <textarea name="texto" required rows={12}
            placeholder={"1; Apellidos, Nombre; fide_id; feda_id\n2; ..."}
            className="rounded border p-3 font-mono text-xs" />
          <button className="rounded bg-black p-3 font-semibold text-white">
            Importar
          </button>
        </form>
      )}
    </main>
  );
}
