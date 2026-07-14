import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user!.id).single();
  const { data: pendiente } = await supabase
    .from("link_requests").select("id").eq("user_id", user!.id)
    .eq("status", "pendiente").maybeSingle();

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Hola, {user?.email}</h1>
      {!profile?.player_id && !pendiente && (
        <Link href="/vincular"
          className="mt-4 block rounded bg-amber-100 p-3 text-sm text-amber-900">
          Aún no estás vinculado a tu ficha del club → hazlo aquí
        </Link>
      )}
      {!profile?.player_id && pendiente && (
        <p className="mt-4 rounded bg-blue-100 p-3 text-sm text-blue-900">
          Solicitud de vinculación pendiente de aprobación.
        </p>
      )}
    </main>
  );
}
