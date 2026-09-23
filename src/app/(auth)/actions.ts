"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { crearCuentaConCodigo } from "@/lib/acceso/registro";
import { validarContrasena } from "@/lib/acceso/contrasena";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: "Email o contraseña incorrectos" };
  // A /club, no a "/": la raíz es la web pública del club, así que redirigir ahí
  // dejaba al socio recién identificado mirando la página de presentación.
  redirect("/club");
}

/**
 * Alta de socio. El registro abierto está desactivado en Supabase, así que la
 * cuenta la crea el servidor con la clave de servicio tras validar el código
 * del club (ver `src/lib/acceso/registro.ts` para el porqué).
 *
 * Al crearse ya confirmada, se inicia sesión acto seguido y el socio entra
 * directo a elegir su ficha, sin pasar por el email.
 */
export async function registro(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const codigo = String(formData.get("codigo") ?? "");

  // Detrás de Vercel la IP real viene en x-forwarded-for (primer valor de la
  // cadena de proxies). En local no hay cabecera: se agrupa todo bajo "local",
  // que solo afecta al contador de intentos.
  const cabeceras = await headers();
  const ip =
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabeceras.get("x-real-ip") ||
    "local";

  const resultado = await crearCuentaConCodigo(email, password, codigo, ip);
  if (!resultado.ok) return { error: resultado.error };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // La cuenta ya existe; si el inicio de sesión falla por lo que sea, que entre
  // por /login en vez de quedarse mirando un error sin salida.
  if (error) redirect("/login?registrado=1");
  redirect("/club/vincular");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Manda el correo para recuperar la contraseña.
 *
 * POR QUÉ HACÍA FALTA (2026-09-23): no existía. La app se lo PROMETÍA al socio en la
 * pantalla de registro —"lo necesitarás si olvidas la contraseña"— y no había forma
 * ninguna: ni pantalla, ni llamada a Supabase. Con 46 socios a punto de crear cuenta, el
 * primero que la olvidara se quedaba fuera hasta que alguien se la cambiara a mano desde
 * el panel de Supabase.
 *
 * SIEMPRE RESPONDE LO MISMO, haya cuenta o no. Si dijera "ese email no está registrado",
 * cualquiera podría averiguar quién es socio del club probando correos, que es
 * justamente lo que el registro por código evita. Supabase tampoco distingue.
 *
 * EL ENLACE SE CONSTRUYE CON EL HOST DE LA PETICIÓN y no con el dominio escrito a mano:
 * así funciona igual en producción, en una vista previa de Vercel y en local. Es lo
 * contrario que los mensajes de compartir, y por el motivo opuesto — allí el enlace se
 * manda a OTRO, aquí se lo manda uno a sí mismo y tiene que volver a donde estaba.
 */
export async function pedirRecuperacion(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Escribe tu email." };

  const cabeceras = await headers();
  const host = cabeceras.get("host") ?? "";
  const protocolo = host.startsWith("localhost") ? "http" : "https";

  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${protocolo}://${host}/auth/confirm?next=/nueva-contrasena`,
  });
  redirect("/recuperar?enviado=1");
}

/**
 * Guarda la contraseña nueva de quien acaba de llegar por el enlace del correo.
 *
 * QUIEN LLEGA AQUÍ YA TIENE SESIÓN: el enlace del correo pasa por `/auth/confirm`, que
 * canjea el token por una sesión de verdad. Por eso basta `updateUser` y no hace falta
 * volver a pedir nada — y por eso también se comprueba que esa sesión exista: sin ella,
 * la pantalla sería un formulario que no puede hacer nada.
 */
export async function cambiarContrasena(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "El enlace ha caducado o ya se ha usado. Pide otro." };
  }

  const validacion = validarContrasena(
    String(formData.get("password") ?? ""),
    String(formData.get("password2") ?? "")
  );
  if (!validacion.ok) return { error: validacion.error };

  const { error } = await supabase.auth.updateUser({
    password: String(formData.get("password")),
  });
  if (error) return { error: "No se ha podido cambiar la contraseña. Prueba otra vez." };

  redirect("/club");
}
