"use client";

import { createContext, useContext, useState } from "react";

/**
 * Si hay una partida EN JUEGO delante de los ojos ahora mismo, jugándola o
 * mirándola.
 *
 * Lo sabe la Mesa (`src/app/club/(vinculado)/jugar/[id]/Mesa.tsx`, que ya
 * calcula `enJuego = p.resultado === null`) y lo necesita `Avisos`, que vive
 * en el layout — la otra punta del árbol respecto a la mesa. Mismo problema
 * que el número rojo del menú, mismo remedio: un contexto minúsculo (ver
 * `Pendientes.tsx`, el precedente de este patrón en el proyecto).
 *
 * POR QUÉ IMPORTA CALLARSE AQUÍ Y NO EN OTRO SITIO: la zona de abajo de la
 * mesa es donde viven el chat, el reloj y los botones de la partida. Una
 * tarjeta de aviso ahí encima no es un estorbo cualquiera — perder por tiempo
 * mientras se lee "Fulano te reta" es mucho peor que dejar caducar ese mismo
 * reto. El aviso no se pierde: sigue en la bandeja y en el número rojo, solo
 * se calla la tarjeta. Y se aplica igual mirando una partida ajena, porque la
 * regla de fondo ya existe en el proyecto para la presencia: nunca encima del
 * tablero.
 */
type EnPartida = { enPartida: boolean; marcar: (v: boolean) => void };

const Contexto = createContext<EnPartida>({ enPartida: false, marcar: () => {} });

export function useEnPartida(): EnPartida {
  return useContext(Contexto);
}

export function ProveedorEnPartida({ children }: { children: React.ReactNode }) {
  const [enPartida, setEnPartida] = useState(false);
  return (
    <Contexto.Provider value={{ enPartida, marcar: setEnPartida }}>{children}</Contexto.Provider>
  );
}
