import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { tratarFallo, type ResultadoDispositivo } from "@/lib/avisos/politica";

// Re-exportado con el nombre histórico de este módulo: la forma del dato vive
// en `politica.ts` (junto a `estadoPushDeAviso`, que es quien la consume),
// pero quien ya importaba `ResultadoSuscripcion` desde aquí no tiene que cambiar.
export type { ResultadoDispositivo as ResultadoSuscripcion };

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

/**
 * Manda el push a TODOS los dispositivos de un usuario e informa qué pasó
 * con cada uno. NUNCA rechaza (ver el `try/catch` de fuera): quien la llama
 * (`avisar()`, en particular) necesita SIEMPRE una respuesta con la que
 * decidir qué guardar, nunca una promesa rota que la deje sin saber si debe
 * marcar el aviso como fallido.
 *
 * Existe separada de `enviarPushAUsuario` porque esa (la usa el botón de
 * prueba del admin y hay tests que dependen de su firma) solo necesita
 * "se ha intentado"; `avisar()` (src/lib/avisos/enviar.ts) sí necesita saber
 * el resultado de cada suscripción para decidir si el aviso queda
 * `entregado`, `fallido` o `no_tocaba` (`estadoPushDeAviso` en `politica.ts`).
 * Comparten la misma llamada a `webpush.sendNotification`; solo cambia qué se
 * hace con el resultado.
 *
 * La decisión de qué hacer con un fallo (reintentar o borrar la suscripción)
 * es de `tratarFallo` (política), no de este módulo: así el mismo criterio
 * 404/410 vive en un único sitio.
 */
export async function intentarPush(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<ResultadoDispositivo[]> {
  // Todo lo de aquí arriba (configurar VAPID, leer las suscripciones) es
  // preparación común a TODOS los dispositivos, no un envío concreto: si
  // falla (claves VAPID con formato inválido, un fallo de red de verdad al
  // consultar Supabase desde una función serverless...) no hay ningún
  // `endpoint` al que echarle la culpa. Se informa como UN fallo genérico en
  // vez de dejar que la promesa rechace, para que quien llama pueda tratarlo
  // igual que cualquier otro fallo — la alternativa (dejar que reviente) es
  // la fila de `notifications` que se queda en `pendiente` para siempre,
  // porque nadie llega a marcarla `fallido` y el cron solo busca fallidos.
  let admin: ReturnType<typeof createAdminClient>;
  let subs: { endpoint: string; p256dh: string; auth: string }[];
  try {
    asegurarVapidConfigurado();
    admin = createAdminClient();
    const respuesta = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    subs = respuesta.data ?? [];
  } catch {
    return [{ entregado: false, estado: "fallido" }];
  }

  return Promise.all(
    subs.map(async (s): Promise<ResultadoDispositivo> => {
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
          try {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          } catch {
            // Si el borrado en sí falla, no perdemos el resultado de ESTE
            // dispositivo por eso: la suscripción muerta se reintentará
            // borrar la próxima vez que un envío choque con ella.
          }
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
