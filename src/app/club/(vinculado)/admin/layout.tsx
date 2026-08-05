import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth/sesion";

/**
 * Puerta de la zona de administración.
 *
 * Usa `sesionActual()` y no una consulta propia a `profiles.is_admin`: si no, un
 * admin nombrado por rol (tabla `member_roles`) tendría permisos en la base de
 * datos y sería rechazado aquí.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  if (!sesion.esAdmin) redirect("/club");
  return <>{children}</>;
}
