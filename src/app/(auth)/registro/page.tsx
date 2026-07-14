import Link from "next/link";
import { registro } from "../actions";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <form action={async (formData) => { "use server"; await registro(formData); }} className="flex flex-col gap-3">
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
