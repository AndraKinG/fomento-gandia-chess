"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * "Instalar la app": el empujón para tenerla en la pantalla de inicio.
 *
 * POR QUÉ EXISTE (2026-08-12): el primer socio de prueba entró desde el móvil y
 * dijo que no le había salido lo de instalar. Tenía razón, y por dos motivos
 * distintos que hay que conocer para no volver a caer:
 *
 * 1. **En Android**, Chrome solo ofrece instalar si la web responde algo SIN
 *    CONEXIÓN. Nuestro service worker no tenía manejador de `fetch`, así que la
 *    app no era instalable y el aviso no salía nunca (arreglado en `sw.js`).
 * 2. **En iPhone NO EXISTE ningún aviso.** Safari no tiene `beforeinstallprompt`
 *    ni nada parecido: la única forma es Compartir → Añadir a pantalla de inicio,
 *    a mano. Si no se lo contamos, un socio de iPhone NUNCA instala la app — y en
 *    iOS, además, sin instalar NO HAY NOTIFICACIONES, así que se pierde lo más
 *    útil sin saber por qué.
 *
 * De ahí las dos mitades: en Android un botón de verdad que dispara el diálogo
 * del sistema; en iPhone las instrucciones, que es todo lo que la plataforma deja.
 *
 * SE ESCONDE SOLO cuando la app ya está instalada (se está viendo dentro de la
 * PWA), así que no hay que quitarlo de ninguna pantalla: desaparece el día que
 * sobra.
 */

/** El evento de Chrome todavía no está en los tipos de TypeScript. */
type EventoInstalar = Event & { prompt: () => Promise<void> };

type Dispositivo = "pwa" | "apple" | "otro";

/**
 * Qué aparato es esto, leído del navegador.
 *
 * VA POR `useSyncExternalStore` Y NO POR UN EFECTO CON `setState`, y no es por
 * gusto del linter: es la herramienta de React para estado que vive FUERA (aquí,
 * el modo de pantalla y el navegador). De paso resuelve la hidratación — el
 * servidor no sabe nada de esto, así que devuelve "pwa" (que no pinta nada) y
 * React vuelve a preguntar ya en el navegador, sin discrepancia ni parpadeo.
 */
function leerDispositivo(): Dispositivo {
  const enPwa =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (enPwa) return "pwa";

  // El iPad moderno se declara "MacIntel" con dedos, de ahí la segunda comprobación.
  const esApple =
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  return esApple ? "apple" : "otro";
}

/** En el servidor no se pinta nada: "pwa" es justo el caso que no enseña tarjeta. */
function enElServidor(): Dispositivo {
  return "pwa";
}

/** El modo de pantalla puede cambiar (instalar y abrir la PWA), así que se escucha. */
function suscribirse(avisar: () => void): () => void {
  const consulta = window.matchMedia("(display-mode: standalone)");
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

export function InstalarApp({
  compacto = false,
  siempre = false,
}: {
  compacto?: boolean;
  /**
   * true = DI ALGO SIEMPRE, aunque no haya nada que ofrecer.
   *
   * Es para el Perfil, que es donde uno va A BUSCARLO. Sin esto el componente
   * devolvía `null` en tres casos —ya instalada, el navegador no lo ofrece, o el
   * evento todavía no ha llegado— y desde fuera los tres se ven igual: nada. El
   * propietario preguntó literalmente "¿y dónde está la parte de instalar?", que
   * es la prueba de que un hueco silencioso no vale. En Inicio se queda en false:
   * allí sí debe desaparecer cuando no hay nada que hacer, o es ruido.
   */
  siempre?: boolean;
}) {
  const dispositivo = useSyncExternalStore(suscribirse, leerDispositivo, enElServidor);
  /** El evento de Chrome, cuando llega. Null = este navegador no ofrece instalar
   *  (o ya está instalada). */
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    // setState DENTRO DE UN CALLBACK, que es lo que React sí quiere: esto es
    // suscribirse a un aviso del navegador, no calcular estado al montar.
    const alPoder = (e: Event) => {
      // Sin esto Chrome enseña ADEMÁS su propio aviso y salen dos cosas a la vez.
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const alInstalar = () => setInstalada(true);
    window.addEventListener("beforeinstallprompt", alPoder);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoder);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  const yaEsta = instalada || dispositivo === "pwa";
  // En Android/escritorio el botón solo existe si el navegador ha dicho que puede.
  const puedePulsar = dispositivo === "otro" && evento !== null;

  // En Inicio (siempre=false) esto desaparece cuando no hay nada que hacer.
  if (!siempre && (yaEsta || (dispositivo === "otro" && !evento))) return null;

  const caja = compacto
    ? "space-y-2"
    : "space-y-2 rounded-2xl border border-borde-acento bg-tarjeta p-4 shadow-sm";

  return (
    <div className={caja}>
      <p className="text-sm font-semibold text-tinta">
        <span aria-hidden>{yaEsta ? "✅" : "📲"}</span>{" "}
        {yaEsta ? "App instalada" : "Instala la app en el móvil"}
      </p>

      {yaEsta ? (
        <p className="text-sm text-tinta-suave">
          Ya la tienes en este dispositivo. Si quieres tenerla también en otro,
          entra allí con tu cuenta y te lo ofrecerá.
        </p>
      ) : dispositivo === "apple" ? (
        <>
          <p className="text-sm text-tinta-suave">
            En iPhone se hace a mano: toca <b className="font-semibold">Compartir</b> abajo
            en Safari y elige <b className="font-semibold">Añadir a pantalla de inicio</b>.
          </p>
          <p className="text-xs text-tinta-suave">
            En iPhone hace falta instalarla para poder recibir los avisos del club.
          </p>
        </>
      ) : puedePulsar ? (
        <>
          <p className="text-sm text-tinta-suave">
            Se abre como una app, entras más rápido y recibes los avisos del club.
          </p>
          <button
            type="button"
            onClick={() => {
              void evento?.prompt();
              // El evento sirve UNA sola vez: después el botón no haría nada, así
              // que se retira.
              setEvento(null);
            }}
            className="rounded-xl bg-acento-fuerte px-4 py-2 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]"
          >
            Instalar
          </button>
        </>
      ) : (
        // NI INSTALADA NI INSTALABLE AQUÍ: este navegador no ofrece el diálogo.
        // Antes esto era un hueco en blanco y parecía que la app estuviera rota.
        <>
          <p className="text-sm text-tinta-suave">
            Este navegador no ofrece instalarla desde aquí. Prueba desde su menú
            (<b className="font-semibold">⋮ → Instalar aplicación</b>), o entra
            desde el móvil: en Android con Chrome sale un botón, y en iPhone se
            añade desde Compartir en Safari.
          </p>
          <p className="text-xs text-tinta-suave">
            Si acabas de actualizar la app, cierra la pestaña y vuelve a entrar:
            el navegador tarda un momento en darse cuenta de que ya es instalable.
          </p>
        </>
      )}
    </div>
  );
}
