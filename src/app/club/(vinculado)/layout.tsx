import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth/sesion";

/**
 * Todo lo que exige tener una ficha del club aprobada: inicio, equipos,
 * disponibilidad, jornadas, torneos y admin.
 *
 * El grupo de rutas `(vinculado)` no aparece en las URLs — `/club/equipos` sigue
 * siendo `/club/equipos` — y sirve solo para que esta comprobación cubra a todos
 * sus hijos sin repetirla en cada página y sin necesitar saber la ruta actual.
 * `/club/vincular` y `/club/perfil` quedan fuera del grupo a propósito.
 *
 * Es UX, no seguridad: la barrera de verdad son las policies de la migración
 * 0009, que no dejan a un no vinculado leer ni un nombre. Si esto fallara, las
 * pantallas se verían vacías, no llenas.
 *
 * Un admin sin ficha propia pasa igual: administra el club sin ser jugador.
 */
export default async function VinculadoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  if (sesion.playerId == null && !sesion.esAdmin) redirect("/club/vincular");
  return <>{children}</>;
}
