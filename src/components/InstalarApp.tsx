"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * "Instalar la app": la guía para tenerla en la pantalla de inicio.
 *
 * LO PRIMORDIAL, dicho por el propietario el 2026-08-12: que CUALQUIER socio, con
 * cualquier móvil y cualquier navegador, tenga aquí la explicación de cómo
 * instalarla. Todo lo demás es secundario.
 *
 * POR QUÉ HIZO FALTA. El primer socio de prueba dijo que no le salió lo de
 * instalar, y había tres motivos distintos:
 *
 * 1. **En Android**, Chrome solo lo ofrece si la web responde algo SIN CONEXIÓN.
 *    Nuestro service worker no tenía manejador de `fetch`, así que la app no era
 *    instalable y el aviso no salía nunca (arreglado en `sw.js`).
 * 2. **En iPhone NO EXISTE ningún botón posible.** Safari no tiene ninguna API de
 *    instalación: la única vía es Compartir → Añadir a pantalla de inicio, a mano.
 *    Y ojo, **en iOS sin instalar NO HAY NOTIFICACIONES**.
 * 3. **Desde el navegador de WhatsApp no se puede instalar**, y es por donde entra
 *    casi todo el club. Es un WebView sin esa capacidad; no hay API que lo rodee.
 *
 * QUÉ NO SE PUEDE SABER, y por eso el texto es NEUTRO: desde una pestaña normal
 * **no hay forma fiable de saber si la app ya está instalada en el equipo**. Se
 * intentaron dos caminos y los dos fallaron en producción: `getInstalledRelatedApps()`
 * (no reporta PWA en Chrome de escritorio) y dejar una nota en `localStorage` desde
 * la app para que la leyera la pestaña (no compartían almacenamiento en el Chrome
 * del propietario). Así que **no se afirma nada**: se explica, y se recuerda que
 * quien ya la tenga la abra desde su icono. Lo único que sí se sabe con certeza es
 * cuándo estamos ejecutándonos DENTRO de la app (`display-mode: standalone`), y
 * ahí sí se dice.
 */

/** El evento de Chrome todavía no está en los tipos de TypeScript. */
type EventoInstalar = Event & { prompt: () => Promise<void> };

type Dispositivo =
  /** Todavía no se sabe: en el servidor no hay navegador que preguntar. */
  | "mirando"
  /** Ejecutándose COMO app. Es lo único que se puede afirmar con certeza. */
  | "pwa"
  /** iPhone/iPad en Safari: instrucciones, que es todo lo que Apple permite. */
  | "apple"
  /** iPhone/iPad en un navegador que NO es Safari: ahí NO se puede instalar. */
  | "appleSinSafari"
  /** Navegador DENTRO de otra app (WhatsApp, Instagram…): no puede instalar. */
  | "appExterna"
  | "otro";

/**
 * ¿Estamos dentro del navegador de otra app?
 *
 * ESTO IMPORTA MÁS QUE NADA EN LA PRÁCTICA: el enlace del club se reparte por
 * WhatsApp, y al tocarlo NO se abre Chrome ni Safari — se abre el navegador
 * interno de WhatsApp, que no puede instalar nada. Un socio hace todo bien y no
 * le sale el botón; sin decírselo, concluye que la app está rota.
 */
function esAppExterna(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|TikTok|MicroMessenger|; wv\)/i.test(ua);
}

function esApple(ua: string): boolean {
  // El iPad moderno se declara "MacIntel" con dedos, de ahí la segunda comprobación.
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

function leerDispositivo(): Dispositivo {
  const enPwa =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (enPwa) return "pwa";

  const ua = window.navigator.userAgent;
  if (esApple(ua)) {
    // En iOS solo Safari puede añadir a la pantalla de inicio: Chrome y Firefox
    // de iPhone (CriOS/FxiOS) y los navegadores dentro de otras apps, no.
    const enSafari = !/CriOS|FxiOS|EdgiOS/i.test(ua) && !esAppExterna(ua);
    return enSafari ? "apple" : "appleSinSafari";
  }
  return esAppExterna(ua) ? "appExterna" : "otro";
}

/**
 * En el servidor no se sabe nada de esto.
 *
 * Devuelve "mirando" —que no pinta nada— y NO "pwa": con "pwa" se colaba un
 * destello de "App instalada" en la primera pintada para todo el mundo, hasta que
 * el navegador contestaba de verdad.
 */
function enElServidor(): Dispositivo {
  return "mirando";
}

/** El modo de pantalla puede cambiar (instalar y abrir la PWA), así que se escucha. */
function suscribirse(avisar: () => void): () => void {
  const consulta = window.matchMedia("(display-mode: standalone)");
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

/**
 * Saca al socio del navegador de la otra app y lo lleva al bueno, con la MISMA
 * página, para que pueda instalar allí.
 *
 * `intent://` es el esquema de Android para "ábreme esto con esta app": funciona
 * desde un WebView y es la vía documentada. En iOS no hay equivalente oficial;
 * `x-safari-https:` funciona en la práctica desde hace años pero NO está
 * documentado, así que se intenta y punto: si no hace nada, las instrucciones y el
 * botón de copiar siguen en pantalla. Nunca es la única salida.
 */
function abrirEnNavegadorBueno(): void {
  const url = window.location.href;
  if (esApple(window.navigator.userAgent)) {
    window.location.href = url.replace(/^https:/, "x-safari-https:");
    return;
  }
  const sinEsquema = url.replace(/^https?:\/\//, "");
  window.location.href = `intent://${sinEsquema}#Intent;scheme=https;package=com.android.chrome;end`;
}

export function InstalarApp({
  compacto = false,
  siempre = false,
}: {
  compacto?: boolean;
  /**
   * true = DI ALGO SIEMPRE, aunque no haya botón que ofrecer.
   *
   * Es para el Perfil, que es donde uno va A BUSCARLO: allí la guía tiene que
   * estar pase lo que pase, para cualquier navegador. En Inicio se queda en false
   * y solo aparece cuando hay algo que pulsar, o sería ruido.
   */
  siempre?: boolean;
}) {
  const dispositivo = useSyncExternalStore(suscribirse, leerDispositivo, enElServidor);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    // setState DENTRO DE UN CALLBACK, que es lo que React sí quiere: esto es
    // suscribirse a un aviso del navegador, no calcular estado al montar.
    const alPoder = (e: Event) => {
      // Sin esto Chrome enseña ADEMÁS su propio aviso y salen dos cosas a la vez.
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    // Instalada desde el botón: el evento ya no sirve, así que se retira.
    const alInstalar = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", alPoder);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoder);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (dispositivo === "mirando") return null;

  const enLaApp = dispositivo === "pwa";
  const fueraDelNavegador = dispositivo === "appExterna" || dispositivo === "appleSinSafari";
  const puedePulsar = dispositivo === "otro" && evento !== null;

  // En Inicio esto desaparece cuando no hay nada que pulsar ni que explicar.
  if (!siempre && (enLaApp || (dispositivo === "otro" && !evento))) return null;

  const caja = compacto
    ? "space-y-2"
    : "space-y-2 rounded-2xl border border-borde-acento bg-tarjeta p-4 shadow-sm";
  const boton =
    "rounded-xl bg-acento-fuerte px-4 py-2 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]";

  // ESTAR DENTRO DE LA APP es lo único que se puede afirmar sin equivocarse.
  if (enLaApp) {
    return (
      <div className={caja}>
        <p className="text-sm font-semibold text-tinta">
          <span aria-hidden>✅</span> Estás usando la app instalada
        </p>
        <p className="text-sm text-tinta-suave">
          Si la quieres también en otro móvil u ordenador, entra allí con tu cuenta
          y verás cómo hacerlo.
        </p>
      </div>
    );
  }

  return (
    <div className={caja}>
      <p className="text-sm font-semibold text-tinta">
        <span aria-hidden>📲</span> Instalar la app
      </p>

      <p className="text-sm text-tinta-suave">
        {fueraDelNavegador
          ? "Has entrado desde otra app y desde ahí no se puede instalar. Un toque y sigues en el navegador:"
          : dispositivo === "apple"
            ? "En iPhone se añade a mano: toca Compartir abajo en Safari y elige «Añadir a pantalla de inicio»."
            : "Se abre como una app, entras más rápido y recibes los avisos del club."}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {puedePulsar && (
          <button
            type="button"
            onClick={() => {
              void evento?.prompt();
              // El evento sirve UNA sola vez: después no haría nada.
              setEvento(null);
            }}
            className={boton}
          >
            Instalar
          </button>
        )}
        {fueraDelNavegador && (
          <button type="button" onClick={abrirEnNavegadorBueno} className={boton}>
            {dispositivo === "appleSinSafari" ? "Abrir en Safari" : "Abrir en Chrome"}
          </button>
        )}
        {/* EL PLAN B QUE FUNCIONA SIEMPRE: con el enlace copiado, pegarlo en el
            navegador es un paso que nadie falla. */}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.origin + "/club");
            setCopiado(true);
          }}
          className="rounded-xl border border-borde bg-tarjeta px-3 py-2 text-sm text-tinta transition hover:bg-tarjeta-suave active:scale-[0.97]"
        >
          {copiado ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </div>

      {dispositivo === "apple" && (
        <p className="text-xs text-tinta-suave">
          En iPhone hace falta instalarla para poder recibir los avisos del club.
        </p>
      )}

      {/* LA GUÍA PARA CUALQUIER NAVEGADOR, plegada para no estorbar a quien ya
          tiene su botón. Es la petición de fondo del propietario: que nadie se
          quede sin saber cómo hacerlo, tenga el móvil que tenga. Va SIEMPRE, no
          solo cuando falla algo, porque el botón puede tardar en aparecer o no
          aparecer nunca según el navegador. */}
      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-acento-texto underline">
          Cómo instalarla en cada navegador
        </summary>
        <ul className="mt-2 space-y-1.5 text-xs text-tinta-suave">
          <li>
            <b className="font-semibold text-tinta">iPhone o iPad (Safari)</b>: toca
            Compartir (el cuadrado con la flecha, abajo) → Añadir a pantalla de inicio.
            Es la única forma que permite Apple.
          </li>
          <li>
            <b className="font-semibold text-tinta">Android con Chrome</b>: menú ⋮
            (arriba a la derecha) → Instalar aplicación, o Añadir a pantalla de inicio.
          </li>
          <li>
            <b className="font-semibold text-tinta">Android con Samsung Internet</b>:
            menú ☰ → Añadir página a → Pantalla de inicio.
          </li>
          <li>
            <b className="font-semibold text-tinta">Android con Firefox</b>: menú ⋮ →
            Instalar, o Añadir a la pantalla de inicio.
          </li>
          <li>
            <b className="font-semibold text-tinta">Ordenador (Chrome o Edge)</b>: el
            icono de instalar en la barra de direcciones, o menú ⋮ → Instalar aplicación.
          </li>
          <li>
            <b className="font-semibold text-tinta">Desde WhatsApp o Instagram</b>: no
            se puede. Copia el enlace con el botón de arriba y ábrelo en Chrome o Safari.
          </li>
        </ul>
        <p className="mt-2 text-xs text-tinta-suave">
          Si ya la tienes instalada, ábrela desde su icono: el navegador no vuelve a
          ofrecértela.
        </p>
      </details>
    </div>
  );
}
