import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { tratarFallo } from "@/lib/avisos/politica";

let vapidConfigurado = false;

/** Configura las claves VAPID en el primer envío (no en tiempo de import). */
function asegurarVapidConfigurado(): void {
  if (vapidConfigurado) return;
  webpush.setVapidDetails(
    "mailto:admin@fomentogandia.example",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidConfigurado = true;
}

/** Qué pasó al mandar el push a UNA suscripción (un dispositivo/navegador). */
export type ResultadoSuscripcion =
  | { entregado: true }
  | { entregado: false; estado: "fallido" | "no_tocaba" };

/**
 * Manda el push a TODOS los dispositivos de un usuario e informa qué pasó
 * con cada uno.
 *
 * Existe separada de `enviarPushAUsuario` porque esa (la usa el botón de
 * prueba del admin y hay tests que dependen de su firma) solo necesita
 * "se ha intentado"; `avisar()` (src/lib/avisos/enviar.ts) sí necesita saber
 * el resultado de cada suscripción para decidir si el aviso queda
 * `entregado`, `fallido` o `no_tocaba`. Comparten la misma llamada a
 * `webpush.sendNotification`; solo cambia qué se hace con el resultado.
 *
 * La decisión de qué hacer con un fallo (reintentar o borrar la suscripción)
 * es de `tratarFallo` (política), no de este módulo: así el mismo criterio
 * 404/410 vive en un único sitio.
 */
export async function intentarPush(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<ResultadoSuscripcion[]> {
  asegurarVapidConfigurado();
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  return Promise.all(
    (subs ?? []).map(async (s): Promise<ResultadoSuscripcion> => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        return { entregado: true };
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        const resultado = tratarFallo(statusCode);
        if (resultado.borrarSuscripcion) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
        return { entregado: false, estado: resultado.estado };
      }
    })
  );
}

export async function enviarPushAUsuario(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  await intentarPush(userId, payload);
}

/**
 * Envía el mismo push a varios usuarios en paralelo (batch). Devuelve
 * cuántos envíos se intentaron sin lanzar excepción (`enviarPushAUsuario` ya
 * absorbe internamente los fallos de entrega individuales).
 */
export async function enviarPushAMuchos(
  userIds: string[],
  payload: { title: string; body: string; url?: string }
): Promise<number> {
  const resultados = await Promise.allSettled(
    userIds.map((userId) => enviarPushAUsuario(userId, payload))
  );
  return resultados.filter((r) => r.status === "fulfilled").length;
}
