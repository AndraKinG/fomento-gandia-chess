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

type EstadoActivacion =
  | "idle"
  | "activando"
  | "activado"
  | "denegado"
  | "incompatible"
  | "error";

const MENSAJE: Record<Exclude<EstadoActivacion, "idle" | "activando">, string> = {
  activado: "Notificaciones activadas ✓",
  denegado:
    "No has dado permiso. Puedes cambiarlo en los ajustes de notificaciones de tu navegador.",
  incompatible:
    "Este navegador no admite notificaciones. En iPhone hay que instalar la app en la pantalla de inicio primero.",
  error: "No se pudieron activar. Comprueba tu conexión y vuelve a intentarlo.",
};

export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<EstadoActivacion>("idle");

  // Antes este flujo tenía un `.catch(() => {})` que se comía cualquier fallo:
  // el socio pulsaba, no pasaba nada visible y no había forma de saber por qué.
  // Ahora cada final del camino tiene su mensaje, incluido el caso de iOS, que
  // no permite push hasta que la PWA está instalada en la pantalla de inicio.
  async function activar() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("incompatible");
      return;
    }
    setEstado("activando");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado("denegado");
        return;
      }
      await suscribir(reg);
      setEstado("activado");
    } catch {
      setEstado("error");
    }
  }

  if (estado !== "idle" && estado !== "activando") {
    return (
      <p
        role="status"
        className="rounded-xl border border-borde bg-tarjeta p-3 text-center text-sm text-tinta"
      >
        {MENSAJE[estado]}
        {estado === "error" && (
          <button
            type="button"
            onClick={() => setEstado("idle")}
            className="ml-1 font-semibold text-acento-texto underline"
          >
            Reintentar
          </button>
        )}
      </p>
    );
  }

  return (
    <button
      type="button"
      disabled={estado === "activando"}
      onClick={() => {
        void activar();
      }}
      className="w-full rounded-xl bg-degradado-club p-3 font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
    >
      {estado === "activando" ? "Activando…" : "Activar notificaciones"}
    </button>
  );
}
