/**
 * Service worker: notificaciones push y la página de "sin conexión".
 *
 * QUÉ NO HACE: precachear la app. El motor de ajedrez pesa 7 MB y se carga solo
 * cuando alguien pulsa "Analizar"; un precache lo arrastraría al instalar la PWA.
 * Aquí solo se guarda una página estática diminuta.
 *
 * POR QUÉ HAY UN `fetch` SI NO CACHEAMOS NADA — y esto era un BUG DE VERDAD,
 * encontrado el 2026-08-12 cuando el primer socio de prueba dijo que no le había
 * salido lo de instalar la app: **Chrome exige que la web responda algo estando
 * sin conexión para considerarla instalable.** Sin manejador de `fetch` no había
 * aviso de instalación en Android, nunca, y parecía cosa del móvil del socio.
 */

const CACHE = "fomento-v1";
const SIN_CONEXION = "/sin-conexion.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(SIN_CONEXION)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Se tiran las cachés de versiones anteriores y se toma el control ya, sin
  // esperar a que el socio cierre todas las pestañas.
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

/**
 * SOLO NAVEGACIONES, Y SIEMPRE LA RED PRIMERO.
 *
 * Es deliberadamente lo mínimo: no toca las peticiones de datos, ni las de
 * Supabase, ni las imágenes — así no puede romper nada de lo que ya funciona
 * (sesión, tiempo real, jugadas). Cuando hay red, este manejador es invisible;
 * cuando no la hay, devuelve la página de sin conexión en vez del error del
 * navegador. Y de paso es lo que hace la app instalable.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(SIN_CONEXION).then((r) => r ?? Response.error())
    )
  );
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Fomento de Gandia", {
      body: data.body || "",
      // `/icon-192.png` y no `/icon.svg`, que NO EXISTE: llevaba así desde el
      // principio, así que las notificaciones salían con el icono por defecto
      // del navegador en vez del escudo del club (2026-08-12).
      icon: "/icon-192.png",
      badge: "/favicon.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  // Si la app ya está abierta, se la trae al frente y se navega ahí: abrir una
  // segunda ventana de la misma PWA desconcierta y pierde el estado.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abiertas) => {
      for (const cliente of abiertas) {
        if ("focus" in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
