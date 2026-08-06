import Link from "next/link";
import { redirect } from "next/navigation";
import { registro } from "../actions";
import { Banner } from "@/components/ui/Banner";
import { Boton } from "@/components/ui/Boton";
import { Escudo } from "@/components/ui/Escudo";

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
          <Escudo version="completo" lado={140} priority />
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
          <div className="flex flex-col gap-1">
            <label htmlFor="codigo" className="text-sm text-tinta">
              Código del club
            </label>
            <input
              id="codigo"
              name="codigo"
              type="text"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX"
              className="rounded-xl border border-borde bg-tarjeta p-3 font-mono uppercase tracking-wider text-tinta placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-tinta-suave"
            />
            <p className="text-xs text-tinta-suave">
              Te lo pasa el club. Solo los socios pueden crear cuenta.
            </p>
          </div>
          <p className="rounded-xl border border-borde bg-tarjeta-suave p-3 text-xs text-tinta-suave">
            Usa un email al que tengas acceso: lo necesitarás si olvidas la
            contraseña.
          </p>
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
