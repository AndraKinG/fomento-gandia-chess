"use client";

import { useEffect, useState } from "react";

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

async function suscribir(reg: ServiceWorkerRegistration) {
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

export function PushSubscriber() {
  useEffect(() => {
    async function resubscribeSiYaHayPermiso() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      await suscribir(reg);
    }
    resubscribeSiYaHayPermiso().catch(() => {});
  }, []);
  return null;
}

type EstadoActivacion = "idle" | "activado" | "denegado";

export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<EstadoActivacion>("idle");

  async function activar() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      setEstado("denegado");
      return;
    }
    await suscribir(reg);
    setEstado("activado");
  }

  if (estado === "activado") {
    return (
      <p className="rounded bg-black p-3 text-center text-white font-semibold">
        Notificaciones activadas ✓
      </p>
    );
  }

  if (estado === "denegado") {
    return (
      <p className="rounded bg-black p-3 text-center text-white font-semibold">
        Permiso denegado
      </p>
    );
  }

  return (
    <button
      onClick={() => activar().catch(() => {})}
      className="rounded bg-black p-3 text-white font-semibold w-full"
    >
      Activar notificaciones
    </button>
  );
}
