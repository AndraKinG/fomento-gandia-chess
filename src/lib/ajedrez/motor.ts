import { leerInfo, type Analisis } from "./evaluacion";

/**
 * Stockfish, hablando UCI dentro de un Web Worker.
 *
 * QUÉ MOTOR Y POR QUÉ: `stockfish-18-lite-single`, en `public/motor/`.
 *
 * - **`single`** (un solo hilo) porque las versiones con hilos necesitan
 *   `SharedArrayBuffer`, y eso obliga a servir TODA la web con las cabeceras de
 *   aislamiento de origen (COOP/COEP), que romperían cualquier recurso de fuera.
 *   No merece la pena por unos milisegundos de análisis.
 * - **`lite`** porque la red neuronal completa pesa 110 MB. Esta pesa 7 y sigue
 *   jugando muchísimo mejor que cualquiera del club.
 *
 * SE CARGA A MANO, nunca al abrir la pantalla: son 7 MB, y a un socio mirando una
 * partida en el móvil no se le gastan sin que los pida.
 *
 * El motor es GPLv3 y va tal cual, sin tocar, en su carpeta y con su licencia al
 * lado. La app habla con él por mensajes, que es la separación de siempre entre un
 * programa y un motor de ajedrez.
 */
const RUTA = "/motor/stockfish-18-lite-single.js";

/** Lo que tarda el motor en decir `uciok`. Generoso a propósito: son 7 MB, y en un
 *  móvil con mala cobertura la primera vez puede ser lento de verdad. */
const ESPERA_ARRANQUE = 60_000;

export type Escucha = (a: Analisis) => void;

export class Motor {
  private w: Worker | null = null;
  private escucha: Escucha | null = null;

  /** true en cuanto el motor ha contestado `uciok`. */
  get listo(): boolean {
    return this.w !== null;
  }

  async arrancar(): Promise<void> {
    if (this.w) return;
    const w = new Worker(RUTA);

    try {
      await new Promise<void>((cumplir, fallar) => {
        const reloj = setTimeout(
          () => fallar(new Error("El motor tarda demasiado en arrancar")),
          ESPERA_ARRANQUE
        );
        const alMensaje = (e: MessageEvent) => {
          if (String(e.data ?? "") !== "uciok") return;
          clearTimeout(reloj);
          w.removeEventListener("message", alMensaje);
          cumplir();
        };
        w.addEventListener("message", alMensaje);
        w.addEventListener(
          "error",
          () => {
            clearTimeout(reloj);
            fallar(new Error("No se ha podido cargar el motor"));
          },
          { once: true }
        );
        w.postMessage("uci");
      });
    } catch (e) {
      // Si no arranca no se queda un Worker suelto comiendo memoria.
      w.terminate();
      throw e;
    }

    w.addEventListener("message", (e) => {
      const info = leerInfo(String(e.data ?? ""));
      if (info) this.escucha?.(info);
    });
    this.w = w;
  }

  /**
   * Analiza una posición. Cada llamada CORTA la anterior: al pasar jugadas se
   * cambia de posición más rápido de lo que el motor termina, y sin el `stop` se
   * amontonarían análisis y llegarían evaluaciones de posiciones ya pasadas.
   */
  analizar(fen: string, profundidad: number, escucha: Escucha): void {
    if (!this.w) return;
    this.escucha = escucha;
    this.w.postMessage("stop");
    this.w.postMessage(`position fen ${fen}`);
    this.w.postMessage(`go depth ${profundidad}`);
  }

  parar(): void {
    this.escucha = null;
    this.w?.postMessage("stop");
  }

  cerrar(): void {
    this.escucha = null;
    this.w?.terminate();
    this.w = null;
  }
}
