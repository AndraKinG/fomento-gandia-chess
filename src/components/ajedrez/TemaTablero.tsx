"use client";

import { createContext, useContext } from "react";
import { TEMA_POR_DEFECTO, type TemaTablero } from "@/lib/ajedrez/temas";

/**
 * El tema del tablero elegido por quien mira, para que TODOS los tableros de la
 * app lo usen sin que cada pantalla tenga que ir a buscarlo.
 *
 * POR CONTEXTO Y NO POR PROP: el `Tablero` se monta en la mesa en vivo, el visor
 * de partidas, el editor de subirlas y el selector del perfil. Pasarle el tema a
 * mano obligaría a enhebrarlo por todas esas pantallas — y la que se olvidara
 * pintaría el tablero de otro color, que es justo el tipo de incoherencia que un
 * ajuste personal no puede tener.
 *
 * Lo provee el layout del club leyendo `profiles.tema_tablero`; quien no ha
 * elegido nada (o quien mira sin sesión, si algún día pasa) recibe el del club.
 */
const Contexto = createContext<TemaTablero>(TEMA_POR_DEFECTO);

export function useTemaTablero(): TemaTablero {
  return useContext(Contexto);
}

export function ProveedorTemaTablero({
  tema,
  children,
}: {
  tema: TemaTablero;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={tema}>{children}</Contexto.Provider>;
}
