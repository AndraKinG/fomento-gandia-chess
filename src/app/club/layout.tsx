import { redirect } from "next/navigation";
import { PushSubscriber } from "@/components/PushSubscriber";
import { NavLateral, NavInferior } from "@/components/Navegacion";
import { sesionActual } from "@/lib/auth/sesion";

/**
 * Zona de socios. Exige sesión y pone el cromo común (navegación y suscripción a
 * notificaciones).
 *
 * La navegación es la MISMA lista en dos formas según el ancho, no dos menús
 * distintos: barra lateral desde 1024 px, barra inferior por debajo. En un
 * monitor el hueco que sobra es horizontal, así que la lateral cabe sin quitarle
 * sitio al contenido y ahorra el viaje de la vista al borde de abajo.
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

  // Una cuenta recién creada aún no tiene a dónde navegar: solo puede vincularse.
  // En ese caso no se pinta ninguna de las dos barras.
  const conNavegacion = sesion.playerId != null || sesion.esAdmin;

  return (
    <div className="flex flex-1">
      <PushSubscriber />
      {conNavegacion && <NavLateral esAdmin={sesion.esAdmin} email={sesion.email} />}
      {/* `min-w-0` es imprescindible: sin él una tabla ancha estira el flex y
          empuja el layout, en vez de desplazarse dentro de su contenedor.
          `pb-20` deja hueco para la barra inferior, que solo existe en móvil.
          Es un `div` y no un `main` porque cada pantalla ya trae el suyo. */}
      <div className={`min-w-0 flex-1 ${conNavegacion ? "pb-20 lg:pb-0" : ""}`}>
        {children}
      </div>
      {conNavegacion && <NavInferior esAdmin={sesion.esAdmin} />}
    </div>
  );
}
