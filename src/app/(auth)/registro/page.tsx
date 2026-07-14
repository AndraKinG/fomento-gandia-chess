import Link from "next/link";
import { redirect } from "next/navigation";
import { registro } from "../actions";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      {error && (
        <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>
      )}
      <form
        action={async (formData) => {
          "use server";
          const r = await registro(formData);
          if (r?.error) redirect("/registro?error=" + encodeURIComponent(r.error));
        }}
        className="flex flex-col gap-3"
      >
        <input name="email" type="email" required placeholder="Email"
          className="rounded border p-3" />
        <input name="password" type="password" required minLength={8}
          placeholder="Contraseña (mín. 8)" className="rounded border p-3" />
        <button className="rounded bg-black p-3 font-semibold text-white">
          Registrarme
        </button>
      </form>
      <p className="text-sm">
        ¿Ya tienes cuenta? <Link className="underline" href="/login">Entra</Link>
      </p>
    </main>
  );
}
