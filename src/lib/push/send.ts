import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function enviarPushAUsuario(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  asegurarVapidConfigurado();
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  await Promise.allSettled(
    (subs ?? []).map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        )
        .catch(async (err: unknown) => {
          const statusCode =
            typeof err === "object" && err !== null && "statusCode" in err
              ? (err as { statusCode?: number }).statusCode
              : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", s.endpoint);
          }
        })
    )
  );
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
