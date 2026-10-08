"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

/**
 * La escena 3D de la portada, cargada DESPUÉS de que la página responda.
 *
 * POR QUÉ (auditoría del 2026-10-08): `EscenaHero3D` se importaba de forma estática, así
 * que three.js —un solo trozo de 297 KB comprimidos, casi 1 MB sin comprimir— iba en el
 * HTML inicial. El navegador tenía que bajarlo y procesarlo antes de que la portada
 * respondiera, y la portada es justo lo que abre quien llega desde un enlace de WhatsApp,
 * normalmente en el móvil y con datos.
 *
 * MIENTRAS CARGA SE PINTA LA MISMA CAJA OSCURA que pone la escena por debajo
 * (`bg-[#081726]`, `absolute inset-0`). Así no hay salto: primero se ve el fondo del
 * hero con el título encima, y la mesa con las piezas aparece después sobre ese mismo
 * fondo. Si el marcador fuera distinto —el degradado del club, por ejemplo— el cambio de
 * color al llegar la escena se notaría como un parpadeo.
 *
 * DOS CASOS EN LOS QUE NO SE CARGA O NO SE ANIMA:
 *
 * - **Ahorro de datos activado** (`navigator.connection.saveData`): no se baja three.js.
 *   Quien ha pedido gastar menos datos no quiere 300 KB de decoración; se queda el fondo.
 * - **"Reducir movimiento"** del sistema: se carga, pero `quieto` — las piezas ya en su
 *   sitio, sin caída ni movimiento de cámara. Antes NADIE le pasaba `quieto` a la escena,
 *   así que quien lo tenía activado recibía la animación entera igualmente.
 */

function Fondo() {
  return <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#081726]" />;
}

const Escena = dynamic(() => import("./EscenaHero3D").then((m) => m.EscenaHero3D), {
  ssr: false,
  loading: Fondo,
});

const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

function suscribirMovimiento(avisar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA_MOVIMIENTO);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}
const leerMovimiento = () => window.matchMedia(CONSULTA_MOVIMIENTO).matches;

/** `saveData` no avisa cuando cambia: se lee una vez, que es lo que importa al cargar. */
const sinSuscripcion = () => () => {};
const leerAhorroDatos = () =>
  Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  );

/** En el servidor no se sabe nada del navegador: se asume lo normal y se corrige al hidratar. */
const enElServidor = () => false;

export function EscenaHero3DDiferida() {
  const ahorroDatos = useSyncExternalStore(sinSuscripcion, leerAhorroDatos, enElServidor);
  const reducirMovimiento = useSyncExternalStore(
    suscribirMovimiento,
    leerMovimiento,
    enElServidor
  );
  if (ahorroDatos) return <Fondo />;
  return <Escena quieto={reducirMovimiento} />;
}
