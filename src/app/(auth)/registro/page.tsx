import Link from "next/link";
import { redirect } from "next/navigation";
import { registro } from "../actions";
import { Banner } from "@/components/ui/Banner";
import { Boton } from "@/components/ui/Boton";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-fondo p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="bg-degradado-club bg-clip-text text-6xl leading-none text-transparent">
            ♞
          </span>
          <h1 className="text-2xl font-bold text-tinta">Crear cuenta</h1>
          <p className="text-sm text-tinta-suave">Club de ajedrez · Gandia</p>
        </div>
        {error && <Banner tipo="error">{error}</Banner>}
        <form
          action={async (formData) => {
            "use server";
            const r = await registro(formData);
            if (r?.error) redirect("/registro?error=" + encodeURIComponent(r.error));
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-tinta">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="tucorreo@ejemplo.com"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-tinta">
              Contraseña (mín. 8)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
            />
          </div>
          <Boton variante="degradado">Registrarme</Boton>
        </form>
        <p className="text-center text-sm text-tinta">
          ¿Ya tienes cuenta?{" "}
          <Link className="text-acento-texto underline" href="/login">
            Entra
          </Link>
        </p>
      </div>
    </main>
  );
}
