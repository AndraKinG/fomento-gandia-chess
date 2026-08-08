import { Chess } from "chess.js";

/**
 * Lectura de lo que escupe el motor y traducción a algo que un socio entienda.
 *
 * Todo lo de este fichero es PURO: aquí no se arranca ningún motor ni se toca el
 * navegador. Eso vive en `motor.ts`, que sí necesita un Worker. Se parte así porque
 * lo que de verdad se puede equivocar es esto —el signo de la puntuación y la
 * traducción de la línea principal— y así se prueba sin arrancar 7 MB de WebAssembly.
 */

/** Puntuación de una posición tal como la da UCI. */
export type Puntuacion =
  | { tipo: "cp"; valor: number }
  /** Jugadas hasta el mate. Positivo = da mate quien tiene el turno. */
  | { tipo: "mate"; valor: number };

export type Analisis = {
  profundidad: number;
  /** Ya vista DESDE LAS BLANCAS, que es como se lee una evaluación. */
  puntuacion: Puntuacion;
  /** Línea principal, en notación UCI (`e2e4`). */
  pv: string[];
};

/**
 * Lee una línea `info` del motor.
 *
 * Devuelve null para todo lo que no sea una evaluación completa: el motor escupe
 * muchísimas líneas de servicio (`info string`, `info currmove`…) y las que no traen
 * puntuación no valen para nada.
 *
 * OJO: la puntuación de UCI va SIEMPRE desde el punto de vista de quien mueve. Aquí
 * se devuelve tal cual; darle la vuelta es cosa de `desdeLasBlancas`.
 */
export function leerInfo(linea: string): Omit<Analisis, "puntuacion"> & {
  puntuacion: Puntuacion;
} | null {
  if (!linea.startsWith("info ")) return null;
  const trozos = linea.split(/\s+/);

  const iProfundidad = trozos.indexOf("depth");
  const iPuntuacion = trozos.indexOf("score");
  if (iProfundidad === -1 || iPuntuacion === -1) return null;

  const tipo = trozos[iPuntuacion + 1];
  const valor = Number(trozos[iPuntuacion + 2]);
  if ((tipo !== "cp" && tipo !== "mate") || !Number.isFinite(valor)) return null;

  // Un `upperbound`/`lowerbound` es una evaluación a medias: el motor avisa de que
  // solo sabe que está por encima o por debajo, y enseñarla hace bailar el número.
  if (trozos.includes("upperbound") || trozos.includes("lowerbound")) return null;

  const iPv = trozos.indexOf("pv");
  return {
    profundidad: Number(trozos[iProfundidad + 1]) || 0,
    puntuacion: { tipo, valor },
    pv: iPv === -1 ? [] : trozos.slice(iPv + 1),
  };
}

/** Le da la vuelta a la puntuación si mueven las negras, para leerla siempre igual. */
export function desdeLasBlancas(p: Puntuacion, turno: "w" | "b"): Puntuacion {
  if (turno === "w") return p;
  return { tipo: p.tipo, valor: -p.valor };
}

/**
 * Texto corto de una puntuación ya vista desde las blancas.
 *
 * Con signo SIEMPRE, incluso en el empate: un "0.00" a secas se lee como "no hay
 * dato", y un "+0.00" deja claro que está igualada.
 */
export function textoPuntuacion(p: Puntuacion): string {
  if (p.tipo === "mate") {
    if (p.valor === 0) return "Mate";
    return `${p.valor > 0 ? "+" : "−"}M${Math.abs(p.valor)}`;
  }
  const peones = p.valor / 100;
  return `${peones >= 0 ? "+" : "−"}${Math.abs(peones).toFixed(2)}`;
}

/**
 * Porcentaje de la barra que ocupan las blancas, de 0 a 100.
 *
 * La ventaja NO es lineal: de +0.5 a +1.5 se juega otra partida, y de +8 a +9 no
 * cambia nada porque ya está ganada. Por eso pasa por una sigmoide, como hace
 * Lichess, en vez de repartir los centipeones a lo bruto.
 */
export function porcentajeBarra(p: Puntuacion): number {
  if (p.tipo === "mate") {
    if (p.valor === 0) return 50;
    return p.valor > 0 ? 100 : 0;
  }
  const y = 100 / (1 + Math.exp(-0.004 * p.valor));
  return Math.max(0, Math.min(100, y));
}

/**
 * Pasa la línea principal de UCI (`e2e4`) a la notación de toda la vida (`e4`).
 *
 * Hace falta porque el motor habla en casillas y un socio lee jugadas. Se para en la
 * primera que no sea legal en vez de reventar: la línea llega mientras el motor
 * sigue pensando y puede venir cortada.
 */
export function pvEnJugadas(fen: string, pv: readonly string[], tope = 6): string[] {
  const jugadas: string[] = [];
  try {
    const c = new Chess(fen);
    for (const uci of pv.slice(0, tope)) {
      const m = c.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      jugadas.push(m.san);
    }
  } catch {
    // Línea a medias: se devuelve lo que se haya podido leer.
  }
  return jugadas;
}

/**
 * Numera las jugadas de la línea como en una partida: `12. Cf3 Ac5 13. d4`.
 *
 * Si empieza moviendo las negras, la primera lleva puntos suspensivos (`12... Ac5`),
 * que es como se escribe siempre y sin lo cual la línea parece empezar mal.
 */
export function lineaNumerada(
  jugadas: readonly string[],
  numeroJugada: number,
  turno: "w" | "b"
): string {
  const partes: string[] = [];
  let n = numeroJugada;
  let mueven = turno;
  for (const j of jugadas) {
    if (mueven === "w") {
      partes.push(`${n}. ${j}`);
      mueven = "b";
    } else {
      partes.push(partes.length === 0 ? `${n}... ${j}` : j);
      mueven = "w";
      n++;
    }
  }
  return partes.join(" ");
}
