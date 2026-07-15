import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { importarOrdenFuerza, sincronizarOrdenFuerzaFACV } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { ChipElo } from "@/components/ui/ChipElo";
import { Boton } from "@/components/ui/Boton";
import { FilaJugadorOF } from "@/components/ui/FilaJugadorOF";

const SEPARADOR_AVISOS = "||";

export default async function OrdenFuerzaPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tipo?: string; avisos?: string }>;
}) {
  const { msg, tipo, avisos } = await searchParams;
  const listaAvisos = avisos ? avisos.split(SEPARADOR_AVISOS) : [];
  const supabase = await createServerSupabase();
  const { data: season } = await supabase
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();
  const { data: orden } = season
    ? await supabase
        .from("force_order")
        .select("numero, bis_index, elo_oficial, players(nombre, elo_fide, elo_feda)")
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

  async function accionSincronizar() {
    "use server";
    const resultado = await sincronizarOrdenFuerzaFACV();
    const params = new URLSearchParams({
      msg: resultado.error
        ?? `Sincronizado: ${resultado.creados} creados, ${resultado.actualizados} actualizados`,
      tipo: resultado.error ? "error" : "ok",
    });
    if (resultado.avisos?.length) {
      params.set("avisos", resultado.avisos.join(SEPARADOR_AVISOS));
    }
    redirect(`/admin/orden-fuerza?${params.toString()}`);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Orden de fuerza" volverA="/admin" />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}
        {listaAvisos.length > 0 ? (
          <Banner tipo="aviso">
            <ul className="list-disc space-y-1 pl-4">
              {listaAvisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Banner>
        ) : null}
        <form action={accionSincronizar}>
          <Boton variante="degradado" className="w-full">
            Sincronizar con la FACV
          </Boton>
        </form>
        {orden && orden.length > 0 ? (
          <ol className="space-y-2">
            {orden.map((f) => {
              const p = f.players as unknown as {
                nombre: string; elo_fide: number | null; elo_feda: number | null;
              };
              return (
                <li key={`${f.numero}-${f.bis_index}`}>
                  <FilaJugadorOF
                    numero={f.numero}
                    bisIndex={f.bis_index}
                    nombre={p.nombre}
                    chips={
                      <>
                        <ChipElo valor={f.elo_oficial} etiqueta="Oficial" />
                        <ChipElo valor={p.elo_fide} etiqueta="FIDE" />
                        <ChipElo valor={p.elo_feda} etiqueta="FEDA" />
                      </>
                    }
                  />
                </li>
              );
            })}
          </ol>
        ) : null}
        <details className="group rounded-xl border border-borde bg-tarjeta p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-tinta">
            Importación manual (respaldo)
            <span
              aria-hidden
              className="shrink-0 text-tinta-suave transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <form action={accion} className="mt-3 flex flex-col gap-3">
            <input name="season" required placeholder="Nombre temporada (ej. Interclubs 2027)"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
            <textarea name="texto" required rows={12}
              placeholder={"1; Apellidos, Nombre; fide_id; feda_id\n2; ..."}
              className="rounded-xl border border-borde bg-tarjeta p-3 font-mono text-xs text-tinta" />
            <button className="rounded-xl bg-acento-fuerte p-3 font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]">
              Importar
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
