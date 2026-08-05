import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarCodigo } from "./codigo";

/**
 * Alta de cuentas del club.
 *
 * NO exportar nada de aquí a un componente de cliente: todo esto usa la clave
 * de servicio. Se llama únicamente desde la server action de `/registro`.
 *
 * Por qué la clave de servicio y no `supabase.auth.signUp()`: el registro
 * abierto está DESACTIVADO en Supabase (ver migración 0009). Tiene que estarlo,
 * porque la clave anónima vive en el navegador y con ella cualquiera puede
 * llamar a `POST /auth/v1/signup` saltándose este código; validar el código del
 * club solo en la server action sería cosmético. `auth.admin.createUser` es la
 * vía exenta de ese cierre, y solo la puede usar el servidor.
 */

/** Intentos fallidos por IP y hora antes de cortar. */
const MAX_INTENTOS_HORA = 10;

export type ResultadoRegistro =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Comprueba si esta IP ha gastado ya su cupo de intentos fallidos.
 * Ante un fallo de la propia consulta se deja pasar: preferimos no bloquear a
 * un socio legítimo por un problema nuestro, ya que la defensa real contra la
 * fuerza bruta es la entropía del código (~60 bits), no este contador.
 */
async function demasiadosIntentos(ip: string): Promise<boolean> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("registro_intentos")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", desde);
  if (error) return false;
  return (count ?? 0) >= MAX_INTENTOS_HORA;
}

async function anotarIntentoFallido(ip: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("registro_intentos").insert({ ip });
}

/**
 * Crea una cuenta del club si el código de acceso es válido.
 *
 * La cuenta se crea con el email ya confirmado (`email_confirm: true`): el
 * código del club es la prueba de pertenencia y la identidad la verifica el
 * admin al aprobar la ficha, así que no hace falta el circuito de confirmación
 * por email — que además no aguantaría a 46 socios registrándose la misma tarde
 * con el SMTP compartido de Supabase. Contrapartida asumida en la spec: un
 * email mal escrito deja a ese socio sin recuperar contraseña por su cuenta.
 */
export async function crearCuentaConCodigo(
  email: string,
  password: string,
  codigoEntrada: string,
  ip: string
): Promise<ResultadoRegistro> {
  if (await demasiadosIntentos(ip)) {
    return {
      ok: false,
      error: "Demasiados intentos. Espera un rato y vuelve a probar.",
    };
  }

  const codigo = normalizarCodigo(codigoEntrada);
  if (!codigo) {
    await anotarIntentoFallido(ip);
    return { ok: false, error: "El código de acceso no es válido." };
  }

  const admin = createAdminClient();
  const { data: fila } = await admin
    .from("access_codes")
    .select("id, usos, max_usos")
    .eq("codigo", codigo)
    .eq("activo", true)
    .maybeSingle();

  // Mensaje deliberadamente genérico e idéntico para "no existe", "desactivado"
  // y "agotado": a quien está probando códigos no se le regala información.
  const agotado =
    fila?.max_usos != null && (fila.usos ?? 0) >= fila.max_usos;
  if (!fila || agotado) {
    await anotarIntentoFallido(ip);
    return { ok: false, error: "El código de acceso no es válido." };
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Un email repetido NO gasta intento: es un socio confundido, no un ataque.
    const yaExiste =
      error.code === "email_exists" ||
      error.status === 422 ||
      /already/i.test(error.message);
    return {
      ok: false,
      error: yaExiste
        ? "Ya existe una cuenta con ese email. Entra con tu contraseña."
        : "No se pudo crear la cuenta. Revisa el email y que la contraseña tenga al menos 8 caracteres.",
    };
  }

  // Incremento atómico: leer-sumar-escribir perdería usos con dos altas
  // simultáneas, algo perfectamente posible cuando se reparte el código por
  // WhatsApp y varios socios entran a la vez.
  await admin.rpc("incrementar_uso_codigo", { codigo_id: fila.id });

  return { ok: true };
}
