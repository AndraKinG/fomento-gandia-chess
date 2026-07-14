import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user!.id).single();
  const { data: pendientes } = await supabase
    .from("link_requests").select("id").eq("user_id", user!.id)
    .eq("status", "pendiente").limit(1);
  const pendiente = (pendientes ?? []).length > 0;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Fomento de Gandia" subtitulo={`Hola, ${user?.email}`} />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {!profile?.player_id && !pendiente && (
          <Banner tipo="aviso">
            Aún no estás vinculado a tu ficha del club →{" "}
            <Link href="/vincular" className="font-semibold underline">
              hazlo aquí
            </Link>
          </Banner>
        )}
        {!profile?.player_id && pendiente && (
          <Banner tipo="ok">
            Solicitud de vinculación pendiente de aprobación.
          </Banner>
        )}
        <EstadoVacio
          icono="♟"
          titulo="Aún no hay jornadas"
          detalle="Cuando arranque el interclubs verás aquí tu próxima jornada"
        />
      </div>
    </main>
  );
}
