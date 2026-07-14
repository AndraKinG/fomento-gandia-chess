import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fuerza } from "@/lib/elo/fuerza";
import { ActivarNotificaciones } from "@/components/PushSubscriber";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipElo } from "@/components/ui/ChipElo";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
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
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Mi perfil" subtitulo={profile?.email} />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {p ? (
          <Tarjeta destacada>
            <p className="text-lg font-semibold text-tinta">{p.nombre}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChipElo valor={p.elo_fide} etiqueta="FIDE" />
              <ChipElo valor={p.elo_feda} etiqueta="FEDA" />
              <ChipElo
                valor={fuerza({ eloFide: p.elo_fide, eloFeda: p.elo_feda, eloOtro: p.elo_otro })}
                etiqueta="Fuerza"
              />
            </div>
          </Tarjeta>
        ) : (
          <EstadoVacio
            titulo="Sin ficha vinculada todavía"
            detalle="Vincúlate a tu ficha del club para ver tu progreso"
          />
        )}
        {!p && (
          <p className="text-center text-sm">
            <Link href="/vincular" className="font-semibold text-acento underline">
              Vincular mi ficha
            </Link>
          </p>
        )}
        <ThemeToggle />
        <ActivarNotificaciones />
        <form action={logout}>
          <button className="w-full rounded-xl border border-borde bg-tarjeta p-3 text-sm text-tinta-suave">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
