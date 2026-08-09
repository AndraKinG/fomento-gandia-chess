import { redirect } from "next/navigation";
import { PushSubscriber } from "@/components/PushSubscriber";
import { NavLateral, NavInferior } from "@/components/Navegacion";
import { sesionActual } from "@/lib/auth/sesion";
import { createServerSupabase } from "@/lib/supabase/server";
import { Avisos } from "@/components/avisos/Avisos";
import { ProveedorPresencia } from "@/components/presencia/Presencia";
import { ProveedorPendientes } from "@/components/avisos/Pendientes";
import { Asistente } from "@/components/asistente/Asistente";

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

  // Retos esperándote, para el número rojo. Una consulta de conteo, sin filas.
  // Es solo el VALOR DE PARTIDA: a partir de aquí lo lleva `Avisos`, que está
  // escuchando. Este número lo pinta el servidor y se quedaría congelado hasta la
  // siguiente navegación, que es por lo que el aviso aparecía tarde.
  let pendientes = 0;
  if (sesion.playerId) {
    const supabase = await createServerSupabase();
    const { count } = await supabase
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("retado_id", sesion.playerId)
      .eq("estado", "pendiente");
    pendientes = count ?? 0;
  }

  return (
    <ProveedorPresencia yo={sesion.playerId} nombre={sesion.nombre}>
    <ProveedorPendientes inicial={pendientes}>
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
      {/* Los avisos van en el layout porque los retos llegan cuando llegan: si solo
          existieran en la pantalla de Jugar, quien está mirando una partida o su
          perfil no se enteraría. */}
      {sesion.playerId && <Avisos yo={sesion.playerId} />}
      {/* El asistente va en el layout y no en cada pantalla: la gracia es poder
          preguntar sin salir de donde estás. Solo para quien ya tiene ficha: sin
          ella no hay nada del club que consultar y la pantalla de vincular tiene
          que quedarse sin distracciones. */}
      {sesion.playerId != null && <Asistente />}
    </div>
    </ProveedorPendientes>
    </ProveedorPresencia>
  );
}
