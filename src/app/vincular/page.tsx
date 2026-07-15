import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipElo } from "@/components/ui/ChipElo";
import { Banner } from "@/components/ui/Banner";
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
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="¿Quién eres?"
        subtitulo="Busca tu nombre en la lista del club"
        volverA="/"
      />
      <div className="mx-auto max-w-md space-y-4 p-4 sm:max-w-2xl">
        <p className="text-sm text-tinta-suave">
          El admin confirmará tu vinculación.
        </p>
        {error && <Banner tipo="error">{error}</Banner>}
        <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
          {libres.map((p) => (
            <li key={p.id}>
              <Tarjeta className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate text-tinta">{p.nombre}</span>
                  <span className="shrink-0">
                    <ChipElo valor={p.elo_fide} etiqueta="FIDE" />
                  </span>
                </div>
                <form
                  className="shrink-0"
                  action={async () => {
                    "use server";
                    const r = await solicitarVinculo(p.id);
                    if (r?.error) redirect("/vincular?error=" + encodeURIComponent(r.error));
                  }}
                >
                  <button className="shrink-0 rounded-xl bg-acento-fuerte px-4 py-1.5 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]">
                    Soy yo
                  </button>
                </form>
              </Tarjeta>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
