import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "../actions";
import { Banner } from "@/components/ui/Banner";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string; error?: string }>;
}) {
  const { registrado, error } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-fondo p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="bg-degradado-club bg-clip-text text-6xl leading-none text-transparent">
            ♞
          </span>
          <h1 className="text-2xl font-bold text-tinta">Fomento de Gandia</h1>
          <p className="text-sm text-tinta-suave">Club de ajedrez · Gandia</p>
        </div>
        {registrado && (
          <Banner tipo="ok">
            Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.
          </Banner>
        )}
        {error && <Banner tipo="error">{error}</Banner>}
        <form
          action={async (formData) => {
            "use server";
            const r = await login(formData);
            if (r?.error) redirect("/login?error=" + encodeURIComponent(r.error));
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
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="Contraseña"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
            />
          </div>
          <button className="rounded-xl bg-degradado-club p-3 font-semibold text-sobre-acento">
            Entrar
          </button>
        </form>
        <p className="text-center text-sm text-tinta">
          ¿Sin cuenta?{" "}
          <Link className="text-acento-fuerte underline dark:text-acento" href="/registro">
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  );
}
