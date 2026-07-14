import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { importarOrdenFuerza } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { ChipElo } from "@/components/ui/ChipElo";

export default async function OrdenFuerzaPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tipo?: string }>;
}) {
  const { msg, tipo } = await searchParams;
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
    const resultado = await importarOrdenFuerza(
      String(formData.get("season")),
      String(formData.get("texto"))
    );
    const params = new URLSearchParams({
      msg: resultado.ok ?? resultado.error ?? "",
      tipo: resultado.ok ? "ok" : "error",
    });
    redirect(`/admin/orden-fuerza?${params.toString()}`);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Orden de fuerza" />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}
        {orden && orden.length > 0 ? (
          <ol className="space-y-2">
            {orden.map((f) => {
              const p = f.players as unknown as {
                nombre: string; elo_fide: number | null; elo_feda: number | null;
              };
              return (
                <li key={`${f.numero}-${f.bis_index}`}>
                  <Tarjeta compacta className="flex items-center gap-3">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-acento-fuerte font-semibold text-sobre-acento ${
                        f.bis_index ? "text-[0.65rem]" : "text-sm"
                      }`}
                    >
                      {f.numero}
                      {f.bis_index ? "bis" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-tinta">{p.nombre}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <ChipElo valor={p.elo_fide} etiqueta="FIDE" />
                        <ChipElo valor={p.elo_feda} etiqueta="FEDA" />
                      </div>
                    </div>
                  </Tarjeta>
                </li>
              );
            })}
          </ol>
        ) : (
          <form action={accion} className="flex flex-col gap-3">
            <input name="season" required placeholder="Nombre temporada (ej. Interclubs 2027)"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
            <textarea name="texto" required rows={12}
              placeholder={"1; Apellidos, Nombre; fide_id; feda_id\n2; ..."}
              className="rounded-xl border border-borde bg-tarjeta p-3 font-mono text-xs text-tinta" />
            <button className="rounded-xl bg-acento-fuerte p-3 font-semibold text-sobre-acento">
              Importar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
