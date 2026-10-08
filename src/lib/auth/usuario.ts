import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Quién es el usuario de esta petición, de las dos formas que hay, y cuándo usar cada una
 * (decisión del propietario, 2026-10-08).
 *
 * - `usuarioDeSesion` → `getClaims()`: comprueba la FIRMA del token de sesión aquí mismo,
 *   sin preguntar a Supabase. El proyecto firma con una clave asimétrica (ES256), así que
 *   la comprobación es local de verdad: solo se baja una vez la clave pública y se guarda.
 *   **Para LEER: pantallas, layouts y el proxy.** Ahorra dos viajes a Supabase por
 *   pantalla (el del proxy y el de `sesionActual`).
 * - `usuarioVerificado` → `getUser()`: le pregunta a Supabase si esa sesión sigue viva.
 *   **Para ESCRIBIR: acciones y rutas que cambian algo.**
 *
 * LA DIFERENCIA, Y POR QUÉ IMPORTA: un token de sesión vale hasta que caduca (como mucho
 * una hora) aunque la sesión se haya cerrado en Supabase entretanto. Con `getClaims`, un
 * token robado de una sesión ya cerrada —o el de una cuenta borrada— seguiría sirviendo
 * para MIRAR pantallas hasta esa hora. Para tocar datos, nunca: las escrituras preguntan
 * siempre a Supabase. El cierre de sesión normal no se ve afectado: borra las cookies del
 * dispositivo, así que ese dispositivo sale al momento.
 *
 * Si algún día el proyecto volviera a firmar con la clave antigua (HS256), `getClaims`
 * no puede comprobarla en local y llama a `getUser` por dentro: seguiría funcionando
 * igual, solo que sin el ahorro.
 */

export type UsuarioDeSesion = { id: string; email: string };

/** Solo hace falta la parte de sesión del cliente: así vale cualquier cliente de Supabase. */
type ConAuth = { auth: SupabaseClient["auth"] };

export async function usuarioDeSesion(supabase: ConAuth): Promise<UsuarioDeSesion | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}

export async function usuarioVerificado(supabase: ConAuth): Promise<UsuarioDeSesion | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "" } : null;
}
