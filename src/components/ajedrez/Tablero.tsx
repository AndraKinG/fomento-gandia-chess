"use client";

import { useRef, useState } from "react";

/**
 * Tablero blanquiazul del club. Componente PRESENTACIONAL: no sabe las reglas
 * del ajedrez, solo dibuja una posición y avisa de los toques. Las reglas viven
 * en quien lo usa (`chess.js`).
 *
 * DOS FORMAS DE MOVER, las dos a la vez, como en Lichess y Chess.com:
 *
 * - **Toque-toque**: se toca la pieza y luego la casilla. Es la que funciona bien en
 *   una pantalla de 375 px, donde arrastrar con el dedo falla a menudo, y la única
 *   que llega con teclado.
 * - **Arrastrar**: se coge la pieza y se suelta donde vaya. Es lo que espera quien
 *   viene de Chess.com, y con ratón es más rápido.
 *
 * Va con eventos de PUNTERO (`pointerdown`/`move`/`up`), no con la API de arrastrar
 * de HTML: aquella no dispara nada con el dedo, así que en un móvil no existiría.
 */

/**
 * Forma tal como la devuelve `chess.board()`, con los nombres en inglés a
 * proposito: convertir las 64 casillas a nombres propios en cada render seria
 * trabajo por nada, y este componente consume esa estructura directamente.
 */
export type Pieza = { type: string; color: "w" | "b" };
/** Pieza que se está llevando con el dedo o el ratón. `lado` es el ancho de una
 *  casilla, para que la que va volando mida lo mismo que las del tablero. */
type Arrastre = { desde: string; x: number; y: number; pieza: Pieza; lado: number };
/** Posición como 8 filas de 8 casillas, de la 8ª a la 1ª (como `chess.board()`). */
export type Filas = (Pieza | null)[][];

const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const FILAS_NUM = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

/**
 * Ruta del SVG de una pieza.
 *
 * ANTES ERAN CARACTERES UNICODE (♞) y por eso el tablero se veía mal: el dibujo lo
 * ponía la fuente del sistema, así que cambiaba de un aparato a otro, en Windows
 * salía plano y las blancas había que fingirlas con el glifo negro y una sombra.
 * Ahora son SVG de verdad, que es lo que hacen Lichess y Chess.com.
 *
 * El nombre sale directo de lo que devuelve `chess.js` (`color` + `type`), así que
 * cambiar de juego de piezas es cambiar los ficheros de `public/piezas/` — ver el
 * LICENCIA.md de esa carpeta.
 */
function rutaPieza(pieza: Pieza): string {
  return `/piezas/${pieza.color}${pieza.type.toUpperCase()}.svg`;
}

const NOMBRE_PIEZA: Record<string, string> = {
  k: "rey",
  q: "dama",
  r: "torre",
  b: "alfil",
  n: "caballo",
  p: "peón",
};

/** Casilla algebraica a partir de los índices de `chess.board()`. */
export function casillaDe(fila: number, columna: number, volteado: boolean): string {
  const f = volteado ? 7 - fila : fila;
  const c = volteado ? 7 - columna : columna;
  return `${COLUMNAS[c]}${8 - f}`;
}

export function Tablero({
  filas,
  volteado = false,
  seleccionada,
  destinos = [],
  ultimoMovimiento,
  enJaque,
  onToque,
  onSoltar,
  deshabilitado = false,
}: {
  filas: Filas;
  /** true para verlo desde las negras. */
  volteado?: boolean;
  seleccionada?: string | null;
  /** Casillas a las que la pieza seleccionada puede ir. */
  destinos?: string[];
  ultimoMovimiento?: { from: string; to: string } | null;
  /** Casilla del rey en jaque, para marcarla. */
  enJaque?: string | null;
  onToque?: (casilla: string) => void;
  /** Se ha arrastrado una pieza de una casilla a otra. Sin esto, el tablero solo
   *  funciona a toques. La legalidad la sigue poniendo quien lo usa. */
  onSoltar?: (desde: string, hasta: string) => void;
  deshabilitado?: boolean;
}) {
  const orden = volteado ? [...filas].reverse().map((f) => [...f].reverse()) : filas;
  const rejilla = useRef<HTMLDivElement | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  // Casilla en la que se apoyó el dedo o el ratón. Un `pointerup` solo cuenta como
  // toque si empezó en la misma casilla: si no, arrastrar desde una casilla vacía y
  // soltar en otra acabaría contando como un toque en la de destino.
  const abajoEn = useRef<string | null>(null);

  /** Casilla que hay bajo un punto de la pantalla, o null si se sale del tablero. */
  function casillaEn(x: number, y: number): string | null {
    const caja = rejilla.current?.getBoundingClientRect();
    if (!caja) return null;
    const j = Math.floor(((x - caja.left) / caja.width) * 8);
    const i = Math.floor(((y - caja.top) / caja.height) * 8);
    if (i < 0 || i > 7 || j < 0 || j > 7) return null;
    return casillaDe(i, j, volteado);
  }

  return (
    <>
      <div
        ref={rejilla}
        role="grid"
        aria-label="Tablero de ajedrez"
        className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl ring-1 ring-borde-acento"
      >
        {orden.map((fila, i) =>
          fila.map((pieza, j) => {
            const casilla = casillaDe(i, j, volteado);
            const clara = (i + j) % 2 === 0;
            const esDestino = destinos.includes(casilla);
            const esSeleccionada = seleccionada === casilla;
            const esUltimo =
              ultimoMovimiento?.from === casilla || ultimoMovimiento?.to === casilla;

            return (
              <button
                key={casilla}
                type="button"
                role="gridcell"
                aria-label={`${casilla}${pieza ? `, ${NOMBRE_PIEZA[pieza.type] ?? pieza.type} ${pieza.color === "w" ? "blanco" : "negro"}` : ", vacía"}`}
                disabled={deshabilitado}
                // `detail === 0` es la firma de un click de TECLADO (Intro o Espacio):
                // los del ratón traen el número de pulsaciones. Los del puntero ya se
                // atienden abajo, y sin esta guarda se contarían dos veces.
                onClick={(e) => {
                  if (e.detail === 0) onToque?.(casilla);
                }}
                onPointerDown={(e) => {
                  if (deshabilitado) return;
                  if (e.pointerType === "mouse" && e.button !== 0) return;
                  abajoEn.current = casilla;
                  // Una casilla que ya es destino de la pieza elegida es un movimiento
                  // a medio hacer, no el principio de un arrastre: si empezara aquí,
                  // se vería volar la pieza que se acaba de capturar.
                  if (!pieza || !onSoltar || esDestino) return;
                  // La captura manda los `pointermove` y el `pointerup` a esta casilla
                  // aunque el dedo ya esté encima de otra: sin ella, el arrastre se
                  // corta en cuanto sales de la casilla de origen.
                  e.currentTarget.setPointerCapture(e.pointerId);
                  // Se selecciona al coger la pieza, que es lo que pinta los destinos
                  // mientras la llevas.
                  onToque?.(casilla);
                  setArrastre({
                    desde: casilla,
                    x: e.clientX,
                    y: e.clientY,
                    pieza,
                    lado: e.currentTarget.getBoundingClientRect().width,
                  });
                }}
                onPointerMove={(e) => {
                  if (arrastre?.desde !== casilla) return;
                  setArrastre((a) => (a ? { ...a, x: e.clientX, y: e.clientY } : a));
                }}
                onPointerUp={(e) => {
                  if (deshabilitado) return;
                  if (arrastre?.desde === casilla) {
                    const hasta = casillaEn(e.clientX, e.clientY);
                    setArrastre(null);
                    // Soltarla donde estaba es un toque, y ya quedó elegida al cogerla.
                    if (hasta && hasta !== casilla) onSoltar?.(casilla, hasta);
                    return;
                  }
                  if (abajoEn.current === casilla) onToque?.(casilla);
                }}
                onPointerCancel={() => setArrastre(null)}
                className={`relative flex aspect-square items-center justify-center ${
                  // Colores del tablero fijos y no del tema: un tablero necesita su
                  // propio contraste entre casillas, y heredar los tokens de fondo
                  // lo haría ilegible en modo oscuro.
                  clara ? "bg-[#e9f2fb]" : "bg-[#6b9dc9]"
                } ${esSeleccionada ? "ring-4 ring-inset ring-amber-400" : ""} ${
                  esUltimo && !esSeleccionada ? "ring-2 ring-inset ring-amber-300/70" : ""
                } ${enJaque === casilla ? "ring-4 ring-inset ring-red-500" : ""} ${
                  deshabilitado ? "cursor-default" : "cursor-pointer"
                }`}
              >
                {/* Coordenadas en los bordes, como en cualquier tablero: en la primera
                    columna la fila, y en la última fila la columna. Van dentro de la
                    casilla y en el color de la contraria para que se lean sin robar
                    sitio a la pieza. */}
                {j === 0 && (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute left-0.5 top-0 text-[0.55rem] font-semibold leading-tight sm:text-[0.65rem] ${
                      clara ? "text-[#6b9dc9]" : "text-[#e9f2fb]"
                    }`}
                  >
                    {volteado ? FILAS_NUM[7 - i] : FILAS_NUM[i]}
                  </span>
                )}
                {i === 7 && (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute bottom-0 right-0.5 text-[0.55rem] font-semibold leading-tight sm:text-[0.65rem] ${
                      clara ? "text-[#6b9dc9]" : "text-[#e9f2fb]"
                    }`}
                  >
                    {volteado ? COLUMNAS[7 - j] : COLUMNAS[j]}
                  </span>
                )}

                {pieza && (
                  /* `<img>` y no `next/image`: son 12 ficheros SVG de 4 KB servidos
                     desde `public/`, y el optimizador de Next no toca los SVG. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rutaPieza(pieza)}
                    alt=""
                    aria-hidden
                    draggable={false}
                    // `touch-none` SOLO en la pieza, no en el tablero entero: hace falta
                    // para que arrastrar con el dedo no desplace la página, y dejándolo
                    // en las casillas vacías la página se sigue pudiendo mover.
                    className={`h-[88%] w-[88%] touch-none select-none ${
                      arrastre?.desde === casilla ? "opacity-30" : ""
                    }`}
                  />
                )}
                {esDestino && (
                  <span
                    aria-hidden
                    className={`absolute ${
                      pieza
                        ? // Captura: aro alrededor de la pieza, no punto encima.
                          "inset-1 rounded-full ring-4 ring-amber-400/80"
                        : "h-1/4 w-1/4 rounded-full bg-amber-400/80"
                    }`}
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* LA PIEZA QUE VUELA va fuera de la rejilla y con posición fija: dentro la
          recortaría el `overflow-hidden` del tablero en cuanto la sacaras por un
          borde. `pointer-events-none` para que no se robe a sí misma el `pointerup`. */}
      {arrastre && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rutaPieza(arrastre.pieza)}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none fixed z-50 select-none drop-shadow-lg"
          style={{
            width: arrastre.lado * 0.95,
            height: arrastre.lado * 0.95,
            left: arrastre.x - arrastre.lado * 0.475,
            top: arrastre.y - arrastre.lado * 0.475,
          }}
        />
      )}
    </>
  );
}
