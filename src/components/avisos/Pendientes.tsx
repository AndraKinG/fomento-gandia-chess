"use client";

import { createContext, useContext, useState } from "react";

/**
 * Los dos números que puede llevar el menú: retos pendientes (badge de
 * "Jugar") y avisos sin leer (badge de "Avisos", la bandeja de
 * `/club/avisos`, tabla `notifications`).
 *
 * ANTES ERA UN SOLO NÚMERO, LA SUMA DE LOS DOS. Se sumaban porque "Avisos" no
 * tenía entrada propia en el menú: el único sitio donde poner un número era
 * encima de Jugar, y un reto recibido tenía que mover ALGO. El problema es
 * que ese número llevaba a la bandeja (porque contaba también avisos sin
 * leer), así que tocarlo con un reto pendiente aterrizaba en "Avisos", que
 * decía "sin avisos" — el reto no es ningún tipo de la tabla `notifications`.
 *
 * Ahora "Avisos" tiene su propia entrada, SIEMPRE VISIBLE, en el menú (ver
 * `Navegacion.tsx`), así que cada número puede contar lo suyo y llevar a
 * donde de verdad corresponde: el de Jugar son retos pendientes, el de
 * Avisos son avisos sin leer. Ya no hace falta sumarlos.
 *
 * POR QUÉ ESTO Y NO LA CUENTA DEL SERVIDOR SIN MÁS. El layout cuenta los dos
 * valores al pintar la página, y esos números se quedan congelados hasta la
 * siguiente navegación: algo que llega mientras estás mirando el calendario
 * no aparecía en el menú hasta que cambiabas de pantalla. Por eso la cuenta
 * del servidor es solo el VALOR DE PARTIDA, y a partir de ahí manda `Avisos`,
 * que ya está escuchando y recalcula LOS DOS con la MISMA fórmula cada pocos
 * segundos — si el servidor y el cliente contaran distinto, el número
 * parpadearía al navegar (bajaría o subiría de golpe al montar la página).
 *
 * Vive en su propio contexto y no dentro de `Avisos` porque quien lo pinta es la
 * navegación, que está en la otra punta del layout.
 */

type Contadores = { avisos: number; retos: number };
type Pendientes = Contadores & { poner: (v: Contadores) => void };

const Contexto = createContext<Pendientes>({ avisos: 0, retos: 0, poner: () => {} });

export function usePendientes(): Pendientes {
  return useContext(Contexto);
}

export function ProveedorPendientes({
  inicial,
  children,
}: {
  inicial: Contadores;
  children: React.ReactNode;
}) {
  const [contadores, setContadores] = useState<Contadores>(inicial);
  return (
    <Contexto.Provider value={{ ...contadores, poner: setContadores }}>
      {children}
    </Contexto.Provider>
  );
}
