"use client";

import { createContext, useContext, useState } from "react";

/**
 * El número rojo del menú: cuántos retos esperan respuesta.
 *
 * POR QUÉ ESTO Y NO LA CUENTA DEL SERVIDOR SIN MÁS. El layout cuenta los retos
 * pendientes al pintar la página, y ese número se queda congelado hasta la siguiente
 * navegación: un reto que llega mientras estás mirando el calendario no aparecía en
 * el menú hasta que cambiabas de pantalla. Por eso la cuenta del servidor es solo el
 * VALOR DE PARTIDA, y a partir de ahí manda `Avisos`, que ya está escuchando.
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
