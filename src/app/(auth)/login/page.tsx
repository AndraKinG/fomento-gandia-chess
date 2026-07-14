import Link from "next/link";
import { login } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>;
}) {
  const { registrado } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Fomento de Gandia · Ajedrez</h1>
      {registrado && (
        <p className="rounded bg-green-100 p-3 text-sm text-green-800">
          Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.
        </p>
      )}
      <form action={async (formData) => { "use server"; await login(formData); }} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email"
          className="rounded border p-3" />
        <input name="password" type="password" required placeholder="Contraseña"
          className="rounded border p-3" />
        <button className="rounded bg-black p-3 font-semibold text-white">
          Entrar
        </button>
      </form>
      <p className="text-sm">
        ¿Sin cuenta? <Link className="underline" href="/registro">Regístrate</Link>
      </p>
    </main>
  );
}
