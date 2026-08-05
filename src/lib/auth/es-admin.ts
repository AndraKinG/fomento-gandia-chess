import { sesionActual } from "@/lib/auth/sesion";

/**
 * true si el usuario autenticado en la sesión actual es admin.
 *
 * Delega en `sesionActual()`, que es el punto único donde se decide el rango:
 * antes esto leía `profiles.is_admin` por su cuenta y no sabía nada del rol
 * `admin` de `member_roles`, así que un admin nombrado por rol pasaba la RLS de
 * Postgres pero era rechazado por todas las acciones de administración.
 */
export async function esAdmin(): Promise<boolean> {
  return (await sesionActual())?.esAdmin ?? false;
}

/**
 * true si puede gestionar socios: la junta o un admin.
 *
 * Todavía sin usar; lo necesitará el formulario público de solicitud de ingreso,
 * que es lo primero que da sentido al rango `junta`.
 */
export async function esJunta(): Promise<boolean> {
  return (await sesionActual())?.esJunta ?? false;
}
