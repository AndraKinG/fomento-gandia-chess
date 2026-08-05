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

/**
 * Se usa el glifo NEGRO para las dos colores y se distinguen por CSS.
 *
 * Los glifos blancos de Unicode (♔♕♖) son de contorno y en muchas tipografías de
 * móvil salen finos, descoloridos o directamente distintos de sus parejas negras.
 * Con el sólido para ambos y relleno claro + borde oscuro para las blancas, el
 * tablero se ve igual en todas partes.
 */
const GLIFO: Record<string, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
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
              aria-label={`${casilla}${pieza ? `, ${pieza.color === "w" ? "blancas" : "negras"} ${pieza.type}` : ", vacía"}`}
              disabled={deshabilitado}
              onClick={() => onToque?.(casilla)}
              className={`relative flex aspect-square items-center justify-center text-[7vw] leading-none sm:text-4xl ${
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
              {pieza && (
                <span
                  aria-hidden
                  className={
                    pieza.color === "w"
                      ? // Relleno claro con borde oscuro: se lee sobre las dos
                        // casillas sin depender de la tipografía del sistema.
                        "text-white [text-shadow:0_0_2px_#0f172a,0_0_2px_#0f172a,0_0_2px_#0f172a]"
                      : "text-[#111c2e]"
                  }
                >
                  {GLIFO[pieza.type]}
                </span>
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
