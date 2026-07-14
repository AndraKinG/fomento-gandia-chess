import { createServerSupabase } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Hola, {user?.email}</h1>
      <form action={logout}>
        <button className="mt-4 rounded border p-2 text-sm">Cerrar sesión</button>
      </form>
    </main>
  );
}
