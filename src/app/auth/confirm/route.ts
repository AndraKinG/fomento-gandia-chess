import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * A dónde mandar después de canjear el token, con `?next=`.
 *
 * HACE FALTA DESDE QUE HAY RECUPERACIÓN DE CONTRASEÑA (2026-09-23): confirmar un email
 * y recuperar la contraseña llegan los dos por aquí, pero acaban en sitios distintos —
 * uno en la app, el otro en la pantalla de escribir la nueva.
 *
 * SOLO SE ACEPTAN RUTAS DE ESTA APP. Un `next` que empiece por `//` o por `http` es un
 * redirect abierto: bastaría mandar al socio un enlace con `next=//otra-web` para que
 * nuestro dominio lo llevara a una copia del login que le roba la contraseña. Y el
 * enlace vendría de verdad desde nuestro correo, que es lo que lo hace creíble.
 */
function destino(next: string | null, type: EmailOtpType | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  // UNA RECUPERACIÓN ACABA SIEMPRE EN LA PANTALLA DE PONER LA CONTRASEÑA, aunque el
  // enlace no traiga `next`. Pasa con el botón "Send password recovery" del panel de
  // Supabase, que es el que usará la junta para desatascar a un socio: ese correo lo
  // compone Supabase y no lleva nuestro parámetro. Sin esto, el socio entraba en la app
  // con sesión y sin haber cambiado nada — creyendo que ya estaba resuelto, y al
  // siguiente inicio de sesión volvía a quedarse fuera.
  if (type === "recovery") return "/nueva-contrasena";
  return "/club";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    // A /club por defecto: quien acaba de confirmar su email es un socio entrando, no
    // una visita que llega a la web pública.
    if (!error) redirect(destino(searchParams.get("next"), type));
  }
  // Un token caducado en una recuperación NO va al login: allí no hay nada que hacer
  // sin contraseña. La pantalla de la nueva ya sabe decir que el enlace ha caducado y
  // ofrecer otro.
  redirect(
    type === "recovery" || searchParams.get("next") === "/nueva-contrasena"
      ? "/nueva-contrasena"
      : "/login"
  );
}
