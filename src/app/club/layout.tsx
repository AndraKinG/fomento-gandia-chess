import { redirect } from "next/navigation";
import { PushSubscriber } from "@/components/PushSubscriber";
import { BottomNav } from "@/components/BottomNav";
import { sesionActual } from "@/lib/auth/sesion";

/**
 * Zona de socios. Exige sesión y pone el cromo común (navegación inferior y
 * suscripción a notificaciones).
 *
 * NO exige tener ficha del club aprobada: `/club/vincular` y `/club/perfil`
 * cuelgan directamente de aquí porque una cuenta recién creada tiene que poder
 * llegar a ellas. Lo que sí requiere ficha vive en el grupo `(vinculado)`.
 */
export default async function ClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");

  const conFicha = sesion.playerId != null;

  return (
    <>
      <PushSubscriber />
      {/* pb-20 deja hueco para la barra fija de abajo, que solo se pinta cuando
          hay algún sitio al que ir. */}
      <div className={conFicha || sesion.esAdmin ? "flex-1 pb-20" : "flex-1"}>
        {children}
      </div>
      {(conFicha || sesion.esAdmin) && <BottomNav esAdmin={sesion.esAdmin} />}
    </>
  );
}
