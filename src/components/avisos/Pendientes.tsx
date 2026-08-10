"use client";

import { createContext, useContext, useState } from "react";

/**
 * El número rojo del menú: retos pendientes + AVISOS SIN LEER (bandeja de
 * `/club/avisos`, tabla `notifications`).
 *
 * Antes contaba solo retos. Un reto no es un aviso de la tabla —"te han
 * retado" no tiene tipo en `notifications`, el único de partidas ahí es
 * `reto_aceptado` y ese va a quien retó, no a quien recibe el reto—, así que
 * las dos cuentas se suman y no se sustituyen: si solo contara avisos sin
 * leer, un reto recibido dejaría de mover el número, que sería una regresión.
 *
 * POR QUÉ ESTO Y NO LA CUENTA DEL SERVIDOR SIN MÁS. El layout cuenta retos y
 * avisos al pintar la página, y ese número se queda congelado hasta la
 * siguiente navegación: algo que llega mientras estás mirando el calendario
 * no aparecía en el menú hasta que cambiabas de pantalla. Por eso la cuenta
 * del servidor es solo el VALOR DE PARTIDA, y a partir de ahí manda `Avisos`,
 * que ya está escuchando y recalcula la MISMA suma cada pocos segundos.
 *
 * Vive en su propio contexto y no dentro de `Avisos` porque quien lo pinta es la
 * navegación, que está en la otra punta del layout.
 */

type Pendientes = { cuantos: number; poner: (n: number) => void };

const Contexto = createContext<Pendientes>({ cuantos: 0, poner: () => {} });

export function usePendientes(): Pendientes {
  return useContext(Contexto);
}

export function ProveedorPendientes({
  inicial,
  children,
}: {
  inicial: number;
  children: React.ReactNode;
}) {
  const [cuantos, setCuantos] = useState(inicial);
  return (
    <Contexto.Provider value={{ cuantos, poner: setCuantos }}>{children}</Contexto.Provider>
  );
}
