"use client";

import { createContext, useContext } from "react";
import { TEMA_POR_DEFECTO, type TemaTablero } from "@/lib/ajedrez/temas";
import { JUEGO_POR_DEFECTO, type JuegoPiezas } from "@/lib/ajedrez/piezas";

/**
 * El aspecto del tablero elegido por quien mira —colores de las casillas y juego
 * de piezas—, para que TODOS los tableros de la app lo usen sin que cada
 * pantalla tenga que ir a buscarlo.
 *
 * POR CONTEXTO Y NO POR PROP: el `Tablero` se monta en la mesa en vivo, el visor
 * de partidas, el editor de subirlas y el selector del perfil. Pasarle el tema a
 * mano obligaría a enhebrarlo por todas esas pantallas — y la que se olvidara
 * pintaría el tablero de otro color, que es justo el tipo de incoherencia que un
 * ajuste personal no puede tener.
 *
 * SON DOS CONTEXTOS y no uno con las dos cosas: el selector del perfil provee
 * solo la parte que está probando (colores en uno, piezas en otro) sin tener que
 * saber —ni pisar— la elección real de la otra.
 *
 * Los provee el layout del club leyendo `profiles.tema_tablero` y
 * `profiles.juego_piezas`; quien no ha elegido nada recibe lo del club.
 */
const ContextoTema = createContext<TemaTablero>(TEMA_POR_DEFECTO);
const ContextoPiezas = createContext<JuegoPiezas>(JUEGO_POR_DEFECTO);

export function useTemaTablero(): TemaTablero {
  return useContext(ContextoTema);
}

export function useJuegoPiezas(): JuegoPiezas {
  return useContext(ContextoPiezas);
}

export function ProveedorTemaTablero({
  tema,
  piezas,
  children,
}: {
  tema?: TemaTablero;
  piezas?: JuegoPiezas;
  children: React.ReactNode;
}) {
  // Cada parte que no se pasa hereda la del proveedor de más arriba (o el
  // default): es lo que deja al selector del perfil proveer solo lo suyo.
  const temaHeredado = useContext(ContextoTema);
  const piezasHeredadas = useContext(ContextoPiezas);
  return (
    <ContextoTema.Provider value={tema ?? temaHeredado}>
      <ContextoPiezas.Provider value={piezas ?? piezasHeredadas}>
        {children}
      </ContextoPiezas.Provider>
    </ContextoTema.Provider>
  );
}
