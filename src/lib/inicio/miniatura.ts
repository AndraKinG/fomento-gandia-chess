import { Chess } from "chess.js";

/**
 * Una partida corta convertida en algo que se puede ANIMAR.
 *
 * EL PROBLEMA QUE RESUELVE: una posición de ajedrez (un FEN) dice qué hay en cada
 * casilla, pero no dice QUÉ PIEZA es cuál. Para animar hace falta lo segundo: si el
 * caballo de f3 se va a e5, el navegador tiene que mover ESE elemento, no borrar uno y
 * pintar otro en la casilla nueva. Pintando FEN tras FEN las piezas parpadean en vez
 * de deslizarse, y ahí se acaba la sensación de fluidez.
 *
 * Así que aquí cada pieza tiene un `id` que le dura toda la partida, y de la partida
 * sale una lista de jugadas que dicen: esta pieza, de aquí a aquí, y esta otra se
 * comió.
 *
 * MÓDULO PURO Y CON TESTS porque es la parte que se puede equivocar en silencio: una
 * animación con la torre mal seguida se ve rara pero no falla, y sin tests eso se
 * descubre mirando la web ya publicada.
 */

/** Una pieza sobre el tablero, con identidad propia. */
export type PiezaAnimada = {
  /** Estable durante toda la partida: es lo que deja animar el mismo elemento. */
  id: string;
  /** `wN`, `bQ`… el nombre del fichero SVG en `public/piezas/<juego>/`. */
  sprite: string;
  /** Casilla donde empieza, en notación algebraica ("e2"). */
  casilla: string;
};

export type JugadaAnimada = {
  /** Qué pieza se mueve. */
  id: string;
  desde: string;
  hasta: string;
  /** La que desaparece del tablero, si esta jugada come. */
  comeId?: string;
  /** En qué se convierte un peón que corona (sprite nuevo para la misma pieza). */
  spriteNuevo?: string;
  /** El SAN, para poder escribirlo al lado del tablero. */
  san: string;
};

export type Miniatura = {
  piezas: PiezaAnimada[];
  jugadas: JugadaAnimada[];
};

/**
 * La partida de Légal (París, 1750).
 *
 * POR QUÉ ESTA: son siete jugadas y acaba en mate con una dama sacrificada, así que
 * cuenta una historia entera en trece medias jugadas — lo que dura un scroll cómodo.
 * Una partida más larga obligaría a scrollear un minuto para ver el final, y una más
 * corta (el mate del pastor) no tiene ninguna gracia que contar.
 *
 * Las jugadas de una partida no son de nadie: esto es historia del ajedrez, publicada
 * en cientos de libros desde el XVIII.
 */
export const PARTIDA_LEGAL = [
  "e4", "e5",
  "Bc4", "d6",
  "Nf3", "Bg4",
  "Nc3", "g6",
  "Nxe5", "Bxd1",
  "Bxf7+", "Ke7",
  "Nd5#",
] as const;

/** El sprite de una pieza de chess.js: color + tipo en mayúscula ("wN"). */
function sprite(color: "w" | "b", tipo: string): string {
  return `${color}${tipo.toUpperCase()}`;
}

/**
 * Convierte una lista de jugadas en SAN en piezas con identidad y movimientos.
 *
 * Lleva un mapa de casilla → id que se va actualizando con cada jugada, que es la
 * forma barata de seguir la pista a cada pieza: quien esté en la casilla de origen es
 * quien se mueve, y quien esté en la de destino es a quien se comen.
 */
export function prepararMiniatura(jugadasSan: readonly string[]): Miniatura {
  const juego = new Chess();

  // Las 32 piezas iniciales, cada una con su id.
  const piezas: PiezaAnimada[] = [];
  const enCasilla = new Map<string, string>();
  for (const fila of juego.board()) {
    for (const casilla of fila) {
      if (!casilla) continue;
      const id = `${casilla.square}-${sprite(casilla.color, casilla.type)}`;
      piezas.push({ id, sprite: sprite(casilla.color, casilla.type), casilla: casilla.square });
      enCasilla.set(casilla.square, id);
    }
  }

  const jugadas: JugadaAnimada[] = [];
  for (const san of jugadasSan) {
    // `chess.js` LANZA con una jugada ilegal, no devuelve null. Se corta la secuencia
    // en lo que llevemos: esto alimenta la portada pública, y una errata en la lista
    // de jugadas tiene que dejar media animación, nunca una página en blanco.
    let m: ReturnType<Chess["move"]> | null = null;
    try {
      m = juego.move(san);
    } catch {
      break;
    }
    if (!m) break;

    const id = enCasilla.get(m.from);
    if (!id) break;

    // AL PASO: la pieza comida NO está en la casilla de destino, sino al lado. Sin
    // este caso, un peón capturado al paso se quedaría en el tablero para siempre.
    const casillaComida = m.flags.includes("e")
      ? `${m.to[0]}${m.from[1]}`
      : m.to;
    const comeId = m.captured ? enCasilla.get(casillaComida) : undefined;
    if (comeId) enCasilla.delete(casillaComida);

    enCasilla.delete(m.from);
    enCasilla.set(m.to, id);

    jugadas.push({
      id,
      desde: m.from,
      hasta: m.to,
      comeId,
      spriteNuevo: m.promotion ? sprite(m.color, m.promotion) : undefined,
      san: m.san,
    });

    // ENROQUE: chess.js lo cuenta como una sola jugada del rey, pero la torre también
    // se mueve. Se añade como jugada propia para que se vea deslizarse.
    if (m.flags.includes("k") || m.flags.includes("q")) {
      const fila = m.color === "w" ? "1" : "8";
      const [desdeTorre, hastaTorre] = m.flags.includes("k")
        ? [`h${fila}`, `f${fila}`]
        : [`a${fila}`, `d${fila}`];
      const idTorre = enCasilla.get(desdeTorre);
      if (idTorre) {
        enCasilla.delete(desdeTorre);
        enCasilla.set(hastaTorre, idTorre);
        jugadas.push({ id: idTorre, desde: desdeTorre, hasta: hastaTorre, san: m.san });
      }
    }
  }

  return { piezas, jugadas };
}

/**
 * Dónde está cada pieza después de `hastaJugada` medias jugadas, y cuáles ya no están.
 *
 * Se recalcula entero en cada paso en vez de guardar 13 posiciones: son 32 piezas y
 * trece jugadas, o sea nada, y a cambio da igual si el scroll va hacia delante o hacia
 * atrás — que es justo lo que hace un scroll de verdad.
 */
export function posicionEn(
  m: Miniatura,
  hastaJugada: number
): { casillas: Record<string, string>; comidas: Set<string>; sprites: Record<string, string> } {
  const casillas: Record<string, string> = {};
  const sprites: Record<string, string> = {};
  for (const p of m.piezas) {
    casillas[p.id] = p.casilla;
    sprites[p.id] = p.sprite;
  }
  const comidas = new Set<string>();

  for (const j of m.jugadas.slice(0, Math.max(0, hastaJugada))) {
    casillas[j.id] = j.hasta;
    if (j.comeId) comidas.add(j.comeId);
    if (j.spriteNuevo) sprites[j.id] = j.spriteNuevo;
  }
  return { casillas, comidas, sprites };
}

/**
 * De casilla algebraica a porcentaje dentro del tablero, con las blancas abajo.
 *
 * En porcentaje y no en píxeles para que el tablero pueda medir lo que quiera —en un
 * móvil ocupa el ancho, en un monitor la mitad— sin recalcular nada al cambiar de
 * tamaño.
 */
export function porcentajeDeCasilla(casilla: string): { x: number; y: number } {
  const columna = casilla.charCodeAt(0) - 97; // 'a' → 0
  const fila = Number(casilla[1]); // 1..8
  return { x: columna * 12.5, y: (8 - fila) * 12.5 };
}
