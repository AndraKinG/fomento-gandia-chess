"use client";

import { useEffect } from "react";

// Nota: se construye con `new Uint8Array(length)` + bucle (en vez de
// `Uint8Array.from(...)`) porque los tipos DOM actuales anotan
// `PushSubscriptionOptionsInit.applicationServerKey` como `BufferSource`,
// que exige `Uint8Array<ArrayBuffer>`; `Uint8Array.from` devuelve
// `Uint8Array<ArrayBufferLike>` y no es asignable bajo TS strict.
function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function PushSubscriber() {
  useEffect(() => {
    async function subscribe() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        }));
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    }
    subscribe().catch(() => {});
  }, []);
  return null;
}
