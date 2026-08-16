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
import { ProveedorTemaTablero } from "@/components/ajedrez/TemaTablero";
import { Latido } from "@/components/uso/Latido";
import { ProximaRonda } from "@/components/torneos/ProximaRonda";
import { leerProximaRonda, type ProximaRondaVista } from "@/lib/torneos/proxima-ronda";
import { temaTablero } from "@/lib/ajedrez/temas";
import { juegoPiezas } from "@/lib/ajedrez/piezas";
import { posicionGuardada, seVeElBoton, sitioBoton } from "@/lib/asistente/boton";

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

  // Los dos números del menú: RETOS PENDIENTES (badge de "Jugar") y AVISOS SIN
  // LEER (badge de "Avisos", la bandeja de `/club/avisos`). Son dos cosas que no
  // tienen nada que ver entre sí —"te han retado" no es ninguno de los tipos de
  // la tabla `notifications`, el único de partidas ahí es `reto_aceptado` y ese
  // va a QUIEN retó, no a quien recibe el reto— y por eso YA NO se suman en un
  // solo número (ver Pendientes.tsx: antes sí, y ese número llevaba siempre a la
  // bandeja, así que un reto pendiente aterrizaba en "sin avisos"). Esto es solo
  // el VALOR DE PARTIDA: a partir de aquí manda `Avisos.tsx` (su `repasar()`),
  // que calcula LOS DOS con la MISMA fórmula cada pocos segundos — puesto aquí y
  // solo en el servidor, la cifra se quedaría congelada hasta la siguiente
  // navegación, que es por lo que el aviso aparecía tarde.
  let avisosSinLeer = 0;
  let retosPendientes = 0;
  // El tema del tablero del socio, para que TODOS los tableros de la app lo
  // pinten sin ir cada uno a la base. Una clave desconocida cae al del club.
  let claveTema: string | null = null;
  let clavePiezas: string | null = null;
  // Dónde quiere el socio el botón del asistente, o si no lo quiere ver.
  let claveAsistente: string | null = null;
  // Y dónde lo dejó si lo arrastró (migración 0045). Null = en su esquina.
  let posicionAsistente: { x: number; y: number } | null = null;
  // La ronda de torneo que le toca al socio dentro de poco, para la tarjeta de
  // "empieza en 43 min". Va en el layout y no en una pantalla porque la hora te
  // pilla donde te pille; la decisión de cuándo se ve es del navegador, no de aquí
  // (ver `ProximaRonda.tsx`).
  let proximaRonda: ProximaRondaVista | null = null;
  if (conNavegacion) {
    const supabase = await createServerSupabase();
    const [{ count: retos }, { count: sinLeer }, { data: preferencias }, ronda] = await Promise.all([
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
      supabase
        .from("profiles")
        .select("tema_tablero, juego_piezas, asistente_boton, asistente_x, asistente_y")
        .eq("id", sesion.userId)
        .maybeSingle(),
      leerProximaRonda(supabase, sesion.playerId),
    ]);
    retosPendientes = retos ?? 0;
    avisosSinLeer = sinLeer ?? 0;
    claveTema = (preferencias?.tema_tablero as string | null) ?? null;
    clavePiezas = (preferencias?.juego_piezas as string | null) ?? null;
    claveAsistente = (preferencias?.asistente_boton as string | null) ?? null;
    posicionAsistente = posicionGuardada(
      preferencias?.asistente_x as number | null,
      preferencias?.asistente_y as number | null
    );
    proximaRonda = ronda;
  }

  return (
    <ProveedorTemaTablero tema={temaTablero(claveTema)} piezas={juegoPiezas(clavePiezas)}>
    {/* LA FICHA DE PRUEBAS NO SE ANUNCIA (migración 0040): con `yo` a null, el canal
        se escucha pero no se hace `track()`, así que la cuenta ve quién está mirando
        y no aparece en la lista de nadie. Es la única forma de que revisar la app con
        ella no le salga en la cara al club. */}
    <ProveedorPresencia
      yo={sesion.fichaDePrueba ? null : sesion.playerId}
      nombre={sesion.nombre}
    >
    <ProveedorPendientes inicial={{ avisos: avisosSinLeer, retos: retosPendientes }}>
    <ProveedorEnPartida>
    <div className="flex flex-1">
      <PushSubscriber />
      {/* El latido de uso: contadores agregados del panel de admin. No pinta nada
          y no falla hacia fuera. Qué guarda y qué no, en la migración 0032. */}
      <Latido />
      {conNavegacion && <NavLateral esAdmin={sesion.esAdmin} email={sesion.email} />}
      {/* `min-w-0` es imprescindible: sin él una tabla ancha estira el flex y
          empuja el layout, en vez de desplazarse dentro de su contenedor.
          `pb-20` deja hueco para la barra inferior, que solo existe en móvil.
          Es un `div` y no un `main` porque cada pantalla ya trae el suyo. */}
      <div className={`min-w-0 flex-1 ${conNavegacion ? "pb-20 lg:pb-0" : ""}`}>
        {/* Encima de la pantalla y no flotando: es un recordatorio que tiene que
            seguir ahí media hora, no un aviso de paso. Se pinta solo cuando falta
            menos de una hora, lo decide el navegador. */}
        <ProximaRonda ronda={proximaRonda} />
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
          que quedarse sin distracciones. Y si el socio lo ha escondido desde su perfil
          (migración 0044), no se monta: un botón flotante tapa una esquina de todas las
          pantallas, y hay quien prefiere esa esquina libre. */}
      {sesion.playerId != null && seVeElBoton(claveAsistente) && (
        <Asistente sitio={sitioBoton(claveAsistente)} posicion={posicionAsistente} />
      )}
    </div>
    </ProveedorEnPartida>
    </ProveedorPendientes>
    </ProveedorPresencia>
    </ProveedorTemaTablero>
  );
}
