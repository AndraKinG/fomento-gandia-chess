import { redirect } from "next/navigation";

/**
 * Redirect de la casa vieja de los torneos del club, que se mudaron a
 * `/club/jugar/torneos` el 2026-08-11 (decisión del propietario: se juegan EN la
 * app, como los retos; la sección Torneos es organización de los de fuera).
 *
 * EXISTE SOLO PARA NO ROMPER LO YA ENVIADO: hay notificaciones push y avisos en
 * bandejas cuyo enlace apunta aquí, y un enlace que un socio guardó no puede dar
 * 404. El catch-all conserva el resto de la ruta: `/torneos/interno/<id>` sigue
 * llevando a su torneo.
 *
 * NADIE DE LA APP DEBE ENLAZAR AQUÍ (mismo trato que /club/torneos).
 */
export default async function TorneosInternoViejo({
  params,
}: {
  params: Promise<{ resto?: string[] }>;
}) {
  const { resto } = await params;
  redirect(`/club/jugar/torneos${resto?.length ? `/${resto.join("/")}` : ""}`);
}
