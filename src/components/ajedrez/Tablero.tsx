"use client";

/**
 * Tablero blanquiazul del club. Componente PRESENTACIONAL: no sabe las reglas
 * del ajedrez, solo dibuja una posición y avisa de los toques. Las reglas viven
 * en quien lo usa (`chess.js`).
 *
 * Interacción de TOQUE-TOQUE, no de arrastrar: se toca la pieza y luego la
 * casilla. Arrastrar una pieza con el dedo en una pantalla de 375 px es incómodo
 * y falla a menudo, y esto además funciona igual con ratón.
 */

/**
 * Forma tal como la devuelve `chess.board()`, con los nombres en inglés a
 * proposito: convertir las 64 casillas a nombres propios en cada render seria
 * trabajo por nada, y este componente consume esa estructura directamente.
 */
export type Pieza = { type: string; color: "w" | "b" };
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
  deshabilitado?: boolean;
}) {
  const orden = volteado ? [...filas].reverse().map((f) => [...f].reverse()) : filas;

  return (
    <div
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
              onClick={() => onToque?.(casilla)}
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
                  className="pointer-events-none h-[88%] w-[88%] select-none"
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
  );
}
