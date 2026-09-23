import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { cambiarContrasena } from "../actions";
import { Banner } from "@/components/ui/Banner";
import { Boton } from "@/components/ui/Boton";
import { Escudo } from "@/components/ui/Escudo";
import { LARGO_MINIMO } from "@/lib/acceso/contrasena";

/**
 * Poner la contraseña nueva, al final del enlace del correo.
 *
 * AQUÍ YA HAY SESIÓN: el enlace pasa antes por `/auth/confirm`, que canjea el token por
 * una sesión de verdad. Por eso esta pantalla no pide la contraseña vieja — quien ha
 * abierto el correo ya ha demostrado que la cuenta es suya.
 *
 * SI NO HAY SESIÓN, NO SE ENSEÑA EL FORMULARIO. Es lo que pasa cuando el enlace ha
 * caducado (una hora) o ya se ha usado: un formulario que no puede guardar nada haría
 * escribir la contraseña dos veces para acabar en un error. Se manda a pedir otro.
 *
 * SE PIDE DOS VECES porque la siguiente pantalla es entrar: una errata aquí deja al
 * socio fuera otra vez, y esta vez sin entender por qué.
 */
export default async function NuevaContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-fondo p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Escudo version="completo" lado={140} priority />
          <h1 className="text-2xl font-bold text-tinta">Nueva contraseña</h1>
        </div>

        {!user ? (
          <>
            <Banner tipo="error">
              El enlace ha caducado o ya se ha usado. Los enlaces valen una hora.
            </Banner>
            <p className="text-center text-sm text-tinta">
              <Link className="text-acento-texto underline" href="/recuperar">
                Pedir uno nuevo
              </Link>
            </p>
          </>
        ) : (
          <>
            {error && <Banner tipo="error">{error}</Banner>}
            <form
              action={async (formData) => {
                "use server";
                const r = await cambiarContrasena(formData);
                if (r?.error) {
                  redirect("/nueva-contrasena?error=" + encodeURIComponent(r.error));
                }
              }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="password" className="text-sm text-tinta">
                  Contraseña nueva
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={LARGO_MINIMO}
                  autoComplete="new-password"
                  className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
                />
                <p className="text-xs text-tinta-suave">
                  Al menos {LARGO_MINIMO} caracteres.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="password2" className="text-sm text-tinta">
                  Repítela
                </label>
                <input
                  id="password2"
                  name="password2"
                  type="password"
                  required
                  minLength={LARGO_MINIMO}
                  autoComplete="new-password"
                  className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
                />
              </div>
              <Boton variante="degradado">Guardar y entrar</Boton>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
