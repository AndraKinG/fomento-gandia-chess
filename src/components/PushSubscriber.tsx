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
  | "comprobando"
  | "idle"
  | "activando"
  | "activado"
  | "yaEstaban"
  | "denegado"
  | "incompatible"
  | "error";

const MENSAJE: Record<
  Exclude<EstadoActivacion, "idle" | "activando" | "comprobando">,
  string
> = {
  activado: "Notificaciones activadas ✓",
  yaEstaban: "Notificaciones activadas ✓",
  denegado:
    "No has dado permiso. Puedes cambiarlo en los ajustes de notificaciones de tu navegador.",
  incompatible:
    "Este navegador no admite notificaciones. En iPhone hay que instalar la app en la pantalla de inicio primero.",
  error: "No se pudieron activar. Comprueba tu conexión y vuelve a intentarlo.",
};

export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<EstadoActivacion>("comprobando");

  /**
   * MIRAR SI YA ESTÁN ACTIVADAS, que es lo que faltaba.
   *
   * Antes esto arrancaba en "idle" y solo cambiaba al pulsar, así que el botón decía
   * "Activar notificaciones" SIEMPRE — estuvieran activas o no. El propietario lo contó
   * como un fallo del móvil: "cada x días se me quitan las notificaciones y tengo que
   * volver a activarlas". No se le quitaban: sus avisos se entregaban sin un fallo
   * (comprobado en la base, estado `entregado`). Lo que no había era forma de verlo, así
   * que cada visita al perfil parecía una desactivación.
   *
   * SE MIRAN LAS DOS COSAS, permiso y suscripción, porque pueden ir por separado: el
   * permiso puede seguir dado y la suscripción haberse perdido (un service worker nuevo,
   * datos del sitio borrados), y entonces el botón SÍ tiene que salir.
   */
  useEffect(() => {
    let vivo = true;
    async function mirar() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (vivo) setEstado("incompatible");
        return;
      }
      if (Notification.permission === "denied") {
        if (vivo) setEstado("denegado");
        return;
      }
      if (Notification.permission !== "granted") {
        if (vivo) setEstado("idle");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (vivo) setEstado(sub ? "yaEstaban" : "idle");
    }
    mirar().catch(() => {
      if (vivo) setEstado("idle");
    });
    return () => {
      vivo = false;
    };
  }, []);

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

  // Mientras se comprueba no se enseña nada: un botón que aparece diciendo "activar" y
  // medio segundo después se convierte en "ya están activadas" invita a pulsarlo antes
  // de que termine de decidirse.
  if (estado === "comprobando") return null;

  if (estado !== "idle" && estado !== "activando") {
    return (
      <p
        role="status"
        className="rounded-xl border border-borde bg-tarjeta p-3 text-center text-sm text-tinta"
      >
        {MENSAJE[estado]}
        {/* SALIDA POR SI ACASO: si de verdad dejan de llegar, desde aquí se vuelve a
            suscribir sin tener que buscar nada en los ajustes del móvil. */}
        {estado === "yaEstaban" && (
          <button
            type="button"
            onClick={() => setEstado("idle")}
            className="ml-1 font-semibold text-acento-texto underline"
          >
            ¿No te llegan? Vuelve a activarlas
          </button>
        )}
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
