import { redirect } from "next/navigation";
import { PushSubscriber } from "@/components/PushSubscriber";
import { NavLateral, NavInferior } from "@/components/Navegacion";
import { sesionActual } from "@/lib/auth/sesion";
import { createServerSupabase } from "@/lib/supabase/server";
import { Avisos } from "@/components/avisos/Avisos";
import { ProveedorPresencia } from "@/components/presencia/Presencia";
import { ProveedorPendientes } from "@/components/avisos/Pendientes";
import { ProveedorEnPartida } from "@/components/avisos/EnPartida";
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

  // Número rojo del menú: RETOS PENDIENTES + AVISOS SIN LEER. Son dos cosas que
  // no tienen nada que ver entre sí — "te han retado" no es ninguno de los tipos
  // de la tabla `notifications` (el único de partidas es `reto_aceptado`, que va
  // a QUIEN retó, no a quien recibe el reto) — y aun así tienen que sumarse en UN
  // solo número: si el número solo contara avisos sin leer, un reto recibido se
  // quedaría sin marca roja, que sería una regresión de un flujo que hoy ya
  // funciona. Es solo el VALOR DE PARTIDA: a partir de aquí manda `Avisos.tsx`
  // (su `repasar()`), que sabe la MISMA suma y la recalcula cada pocos segundos
  // — puesta aquí y solo en el servidor, la cifra se quedaría congelada hasta la
  // siguiente navegación, que es por lo que el aviso aparecía tarde.
  let pendientes = 0;
  if (conNavegacion) {
    const supabase = await createServerSupabase();
    const [{ count: retos }, { count: sinLeer }] = await Promise.all([
      // Sin ficha no hay retos posibles (son entre jugadores): el UUID de
      // relleno no matchea ninguna fila real y evita tener que ramificar la
      // consulta solo para este caso.
      supabase
        .from("challenges")
        .select("id", { count: "exact", head: true })
        .eq("retado_id", sesion.playerId ?? "00000000-0000-0000-0000-000000000000")
        .eq("estado", "pendiente"),
      // `notifications.profile_id` es el id de la CUENTA (auth.uid()), no el de
      // la ficha, así que esto cuenta también para un admin sin ficha propia.
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", sesion.userId)
        .is("leido_en", null),
    ]);
    pendientes = (retos ?? 0) + (sinLeer ?? 0);
  }

  return (
    <ProveedorPresencia yo={sesion.playerId} nombre={sesion.nombre}>
    <ProveedorPendientes inicial={pendientes}>
    <ProveedorEnPartida>
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
      {sesion.playerId && <Avisos yo={sesion.playerId} perfilId={sesion.userId} />}
      {/* El asistente va en el layout y no en cada pantalla: la gracia es poder
          preguntar sin salir de donde estás. Solo para quien ya tiene ficha: sin
          ella no hay nada del club que consultar y la pantalla de vincular tiene
          que quedarse sin distracciones. */}
      {sesion.playerId != null && <Asistente />}
    </div>
    </ProveedorEnPartida>
    </ProveedorPendientes>
    </ProveedorPresencia>
  );
}
