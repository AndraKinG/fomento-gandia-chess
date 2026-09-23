import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { pedirRecuperacion } from "../actions";
import { Banner } from "@/components/ui/Banner";
import { Boton } from "@/components/ui/Boton";
import { Escudo } from "@/components/ui/Escudo";
import { RECUPERACION_POR_EMAIL } from "@/lib/acceso/recuperacion";

/**
 * "No puedo entrar": qué hacer cuando no recuerdas la contraseña.
 *
 * TIENE DOS CARAS SEGÚN `RECUPERACION_POR_EMAIL` (ver `src/lib/acceso/recuperacion.ts`,
 * donde está el porqué). Apagada —hoy— explica que hay que pedírselo a la junta y no
 * enseña formulario. Encendida, pide el correo y Supabase manda el enlace.
 *
 * NO DICE SI EL EMAIL EXISTE, y el mensaje de "enviado" sale igual en los dos casos.
 * Decir "ese email no está registrado" dejaría averiguar quién es socio del club
 * probando correos, que es justo lo que evita el registro por código.
 *
 * SE AVISA DE QUE MIRE EL SPAM porque es donde acaban casi siempre los correos de una
 * app recién estrenada, y un socio que no lo encuentra da por hecho que no funciona y
 * escribe por WhatsApp — que es lo que esta pantalla viene a evitar.
 */
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string }>;
}) {
  const { enviado, error } = await searchParams;

  // Con sesión abierta esto no pinta nada: la contraseña se cambia desde dentro.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/club");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-fondo p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Escudo version="completo" lado={140} priority />
          <h1 className="text-2xl font-bold text-tinta">¿No puedes entrar?</h1>
          {RECUPERACION_POR_EMAIL && (
            <p className="text-sm text-tinta-suave">
              Te mandamos un enlace para poner una nueva contraseña.
            </p>
          )}
        </div>

        {!RECUPERACION_POR_EMAIL ? (
          <>
            {/* SE DICE LO QUE HAY, sin formulario. Un campo de email que manda un
                correo con un enlace que no funciona deja al socio esperando, y encima
                convencido de que la app está rota. */}
            <Banner tipo="aviso">
              Todavía no se puede cambiar la contraseña desde aquí.
            </Banner>
            <p className="text-sm text-tinta">
              Escribe a la junta por el grupo del club y te la cambian en un momento.
              Diles con qué email creaste la cuenta.
            </p>
            <p className="text-center text-sm text-tinta">
              <Link className="text-acento-texto underline" href="/login">
                Volver
              </Link>
            </p>
          </>
        ) : enviado ? (
          <>
            <Banner tipo="ok">
              Si hay una cuenta con ese email, el enlace ya está de camino. Mira también
              la carpeta de spam.
            </Banner>
            <p className="text-center text-sm text-tinta">
              <Link className="text-acento-texto underline" href="/login">
                Volver a entrar
              </Link>
            </p>
          </>
        ) : (
          <>
            {error && <Banner tipo="error">{error}</Banner>}
            <form
              action={async (formData) => {
                "use server";
                const r = await pedirRecuperacion(formData);
                if (r?.error) redirect("/recuperar?error=" + encodeURIComponent(r.error));
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
                  autoComplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
                />
                <p className="text-xs text-tinta-suave">
                  El mismo con el que creaste la cuenta.
                </p>
              </div>
              <Boton variante="degradado">Mandarme el enlace</Boton>
            </form>
            <p className="text-center text-sm text-tinta">
              <Link className="text-acento-texto underline" href="/login">
                Volver
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
