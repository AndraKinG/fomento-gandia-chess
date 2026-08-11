"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * "Instalar la app": el empujón para tenerla en la pantalla de inicio.
 *
 * POR QUÉ EXISTE (2026-08-12): el primer socio de prueba entró desde el móvil y
 * dijo que no le había salido lo de instalar. Tenía razón, y por tres motivos que
 * conviene tener claros para no volver a caer:
 *
 * 1. **En Android**, Chrome solo ofrece instalar si la web responde algo SIN
 *    CONEXIÓN. Nuestro service worker no tenía manejador de `fetch`, así que la
 *    app no era instalable y el aviso no salía nunca (arreglado en `sw.js`).
 * 2. **En iPhone NO EXISTE ningún botón posible.** Safari no tiene
 *    `beforeinstallprompt` ni ninguna API de instalación: la única vía es
 *    Compartir → Añadir a pantalla de inicio, a mano. Y ojo, **en iOS sin
 *    instalar NO HAY NOTIFICACIONES**.
 * 3. **Desde el navegador de WhatsApp no se puede instalar**, y es por donde
 *    entra casi todo el club. No es un fallo nuestro: es un WebView sin esa
 *    capacidad, y no hay API que lo rodee.
 *
 * ASÍ QUE UN BOTÓN "INSTALAR" UNIVERSAL ES IMPOSIBLE. Lo que sí se puede —y es
 * lo que hace esto (petición del propietario: "¿no podemos tener el botón entres
 * por donde entres?")— es que **nunca haya un callejón sin salida**: siempre hay
 * un botón, y hace lo mejor que la plataforma permita en ese momento:
 *
 * - Si el navegador ofrece el diálogo nativo → instala de verdad.
 * - Si estamos dentro de otra app → **te saca al navegador bueno** (`intent://`
 *   abre Chrome en Android; `x-safari-https:` abre Safari en iOS).
 * - Y en cualquier caso, **copiar el enlace**, que es el plan B que funciona
 *   siempre: pegarlo en el navegador y seguir desde ahí.
 */

/** El evento de Chrome todavía no está en los tipos de TypeScript. */
type EventoInstalar = Event & { prompt: () => Promise<void> };

type Dispositivo =
  /** Todavía no se sabe: en el servidor no hay navegador que preguntar. */
  | "mirando"
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
 * documentado, así que se intenta y punto: si no hace nada, las instrucciones y
 * el botón de copiar siguen en pantalla. Nunca es la única salida.
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
   * true = DI ALGO SIEMPRE, aunque no haya nada que ofrecer.
   *
   * Es para el Perfil, que es donde uno va A BUSCARLO. Sin esto el componente
   * devolvía `null` en varios casos distintos y desde fuera todos se ven igual:
   * un hueco. El propietario preguntó "¿y dónde está la parte de instalar?", que
   * es la prueba de que un silencio no vale. En Inicio se queda en false: allí
   * debe desaparecer cuando no hay nada que hacer, o es ruido.
   */
  siempre?: boolean;
}) {
  const dispositivo = useSyncExternalStore(suscribirse, leerDispositivo, enElServidor);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [copiado, setCopiado] = useState(false);

  /**
   * ¿ESTÁ INSTALADA EN ESTE EQUIPO, aunque ahora mismo estemos en una pestaña?
   *
   * `display-mode: standalone` solo contesta "¿me estoy ejecutando COMO app
   * ahora?", que es otra pregunta. El propietario lo vio enseguida: instaló la
   * app en el PC, y desde la app le salía "App instalada" mientras que en la
   * pestaña del navegador seguía diciéndole que la instalara. Quien lo sabe es
   * `getInstalledRelatedApps()`, y para que funcione el manifest tiene que
   * declararse a sí mismo en `related_applications` (hecho).
   *
   * Solo existe en Chrome/Edge, y compara contra la URL ABSOLUTA de producción:
   * en local no detectará nada, y en Safari o Firefox tampoco. De ahí que el
   * texto de "no lo sé" tenga que valer para los dos casos.
   */
  useEffect(() => {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<unknown[]>;
    };
    if (!nav.getInstalledRelatedApps) return;
    // setState en un callback, que es lo que el linter del compilador permite.
    void nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (apps.length > 0) setInstalada(true);
      })
      .catch(() => {
        // Si la API falla no se concluye nada: se deja el texto neutro.
      });
  }, []);

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

  if (dispositivo === "mirando") return null;

  const yaEsta = instalada || dispositivo === "pwa";
  const fueraDelNavegador = dispositivo === "appExterna" || dispositivo === "appleSinSafari";
  const puedePulsar = dispositivo === "otro" && evento !== null;

  // En Inicio esto desaparece cuando no hay nada que hacer.
  if (!siempre && (yaEsta || (dispositivo === "otro" && !evento))) return null;

  const caja = compacto
    ? "space-y-2"
    : "space-y-2 rounded-2xl border border-borde-acento bg-tarjeta p-4 shadow-sm";
  const boton =
    "rounded-xl bg-acento-fuerte px-4 py-2 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]";

  return (
    <div className={caja}>
      {/* "Instala la app" y no "…en el móvil": también se instala en el
          ordenador, y el propietario la instaló justo ahí. */}
      <p className="text-sm font-semibold text-tinta">
        <span aria-hidden>{yaEsta ? "✅" : "📲"}</span>{" "}
        {yaEsta ? "App instalada" : "Instala la app"}
      </p>

      {yaEsta ? (
        <p className="text-sm text-tinta-suave">
          Ya la tienes en este dispositivo — ábrela desde su icono. Si la quieres
          también en otro, entra allí con tu cuenta y te lo ofrecerá.
        </p>
      ) : (
        <>
          <p className="text-sm text-tinta-suave">
            {fueraDelNavegador
              ? "Has entrado desde otra app y desde ahí no se puede instalar. Un toque y sigues en el navegador:"
              : dispositivo === "apple"
                ? "En iPhone se añade a mano: toca Compartir abajo en Safari y elige «Añadir a pantalla de inicio»."
                : "Se abre como una app, entras más rápido y recibes los avisos del club."}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {/* SIEMPRE HAY UN BOTÓN, y hace lo mejor que permita la plataforma:
                instalar de verdad, o sacarte al navegador donde sí se puede. */}
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
            {/* EL PLAN B QUE FUNCIONA SIEMPRE: con el enlace copiado, pegarlo en
                el navegador es un paso que nadie falla. Va en todos los casos en
                que aún no está instalada, incluido el iPhone en Safari (por si
                prefiere hacerlo desde otro sitio). */}
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
          {/* CUANDO NO SE SABE, NO SE AFIRMA. Este caso son DOS situaciones que
              desde aquí no se distinguen —ya está instalada (y por eso el
              navegador no ofrece el diálogo), o este navegador no sabe
              instalarla— así que el texto sirve para las dos. Antes decía "este
              navegador no ofrece el botón" a secas, y el propietario lo leyó
              teniendo la app instalada en ese mismo PC. */}
          {dispositivo === "otro" && !puedePulsar && (
            <p className="text-xs text-tinta-suave">
              Si ya la tienes instalada, ábrela desde su icono: el navegador no
              vuelve a ofrecerla. Si no la tienes, prueba desde el menú del
              navegador (⋮ → Instalar aplicación) o pega el enlace en Chrome.
            </p>
          )}
        </>
      )}
    </div>
  );
}
