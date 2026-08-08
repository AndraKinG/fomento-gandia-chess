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

/**
 * SIN TEMPORIZADORES A PROPÓSITO, salvo el del arranque.
 *
 * La primera versión encolaba las peticiones y esperaba un `readyok` con un tope de
 * cinco segundos. Se quedaba colgada: **el navegador frena los temporizadores de una
 * pestaña que no está delante**, así que basta con cambiar de aplicación un momento
 * en el móvil para que ese tope salte sin que pase nada malo, y el motor quedaba
 * marcado como roto para siempre. Desde fuera: análisis congelado y el botón sin
 * hacer nada.
 *
 * Ahora se va con el protocolo y no con el reloj. Después de un `go`, el motor
 * SIEMPRE contesta `bestmove`, tanto si termina como si se le manda `stop`. Así que
 * se guarda la posición pendiente, se pide `stop` si está buscando, y es la llegada
 * de `bestmove` la que lanza la siguiente búsqueda. Gana siempre la última posición
 * pedida, que es lo que se quiere al pasar jugadas seguidas.
 */
export class Motor {
  private w: Worker | null = null;
  private escucha: Escucha | null = null;
  /** Posición que falta por analizar. Solo se guarda la última: si se pasan cinco
   *  jugadas seguidas, las cuatro primeras ya no le importan a nadie. */
  private pendiente: string | null = null;
  private profundidad = 18;
  private buscando = false;
  /** Profundidad ya repartida de la búsqueda en curso, para no avisar dos veces de
   *  la misma: dentro de una profundidad el motor reevalúa cada vez que encuentra
   *  algo mejor, y repintar por cada una no aporta nada. */
  private ultimaProfundidad = 0;

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

    w.addEventListener("message", (e) => this.alMensaje(String(e.data ?? "")));
    this.w = w;
  }

  private alMensaje(linea: string): void {
    if (linea.startsWith("bestmove")) {
      // Se acabó la búsqueda, por las buenas o porque se le mandó parar. Es AQUÍ
      // donde arranca la siguiente: el motor ya está libre, sin adivinar cuándo.
      this.buscando = false;
      this.lanzar();
      return;
    }
    if (!this.buscando) return;
    const info = leerInfo(linea);
    if (!info || info.profundidad <= this.ultimaProfundidad) return;
    this.ultimaProfundidad = info.profundidad;
    this.escucha?.(info);
  }

  /** Manda a analizar lo que haya pendiente, si el motor está libre. */
  private lanzar(): void {
    const w = this.w;
    const fen = this.pendiente;
    if (!w || this.buscando || fen === null) return;
    this.pendiente = null;
    this.ultimaProfundidad = 0;
    this.buscando = true;
    w.postMessage(`position fen ${fen}`);
    w.postMessage(`go depth ${this.profundidad}`);
  }

  /**
   * Pide analizar una posición. Sustituye a cualquier petición anterior que aún no
   * haya salido: al pasar jugadas se cambia de posición mucho más rápido de lo que
   * el motor termina.
   */
  analizar(fen: string, profundidad: number, escucha: Escucha): void {
    if (!this.w) return;
    this.escucha = escucha;
    this.profundidad = profundidad;
    this.pendiente = fen;
    if (this.buscando) {
      // No se manda `position` mientras piensa: UCI no lo admite. Se le corta, y la
      // llegada de `bestmove` lanzará esta posición.
      this.w.postMessage("stop");
      return;
    }
    this.lanzar();
  }

  parar(): void {
    this.pendiente = null;
    this.escucha = null;
    if (this.buscando) this.w?.postMessage("stop");
  }

  cerrar(): void {
    this.pendiente = null;
    this.escucha = null;
    this.buscando = false;
    this.w?.terminate();
    this.w = null;
  }
}
