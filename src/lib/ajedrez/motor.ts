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

/** Lo que se le da al motor para contestar un `isready` una vez cargado. Cortar una
 *  búsqueda es cosa de milisegundos; si pasan cinco segundos es que algo va mal. */
const ESPERA_RESPUESTA = 5_000;

export type Escucha = (a: Analisis) => void;

export class Motor {
  private w: Worker | null = null;
  private escucha: Escucha | null = null;
  /** Sube con cada petición. Sirve para tirar a la basura lo que llegue tarde de un
   *  análisis que ya no interesa. */
  private generacion = 0;
  /** true solo entre el `go` y la siguiente petición. Sin esto, las evaluaciones que
   *  el motor todavía está escupiendo de la posición ANTERIOR se pintarían como si
   *  fueran de la nueva. */
  private enMarcha = false;
  /** Las peticiones se encolan porque hay que ESPERAR al motor entre medias, y al
   *  pasar jugadas seguidas se piden más rápido de lo que contesta. */
  private cola: Promise<void> = Promise.resolve();
  private roto = false;

  /** true en cuanto el motor ha contestado `uciok`. */
  get listo(): boolean {
    return this.w !== null && !this.roto;
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
      if (info && this.enMarcha) this.escucha?.(info);
    });
    // Si el Worker se cae con el motor ya arrancado, se marca roto para que la
    // pantalla pueda decirlo. Antes esto no se miraba y el análisis se quedaba
    // callado y en blanco, sin que nadie supiera por qué.
    w.addEventListener("error", () => {
      this.roto = true;
      this.enMarcha = false;
    });
    this.w = w;
  }

  /**
   * Analiza una posición. Cada llamada anula la anterior.
   *
   * EL PROBLEMA QUE RESUELVE LA COLA: UCI no admite un `position` mientras el motor
   * está pensando, y `stop` no es instantáneo —el motor todavía tiene que terminar y
   * contestar—. Mandando `stop` + `position` + `go` de golpe, pasar tres jugadas
   * seguidas dejaba al motor mudo: el análisis se quedaba en su estado de partida y
   * ya no volvía. Ahora se espera un `readyok` entre medias, y las peticiones se
   * encolan, que es como se habla con un motor UCI.
   */
  analizar(fen: string, profundidad: number, escucha: Escucha): void {
    if (!this.w || this.roto) return;
    const mia = ++this.generacion;
    this.escucha = escucha;
    // Deja de repartir: lo que quede del análisis anterior ya no vale.
    this.enMarcha = false;

    this.cola = this.cola.then(async () => {
      const w = this.w;
      if (!w || this.roto || mia !== this.generacion) return;
      w.postMessage("stop");
      try {
        await this.esperar(w, "readyok", () => w.postMessage("isready"));
      } catch {
        this.roto = true;
        return;
      }
      // Mientras se esperaba puede haber entrado otra petición más nueva.
      if (mia !== this.generacion) return;
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go depth ${profundidad}`);
      this.enMarcha = true;
    });
  }

  /** Espera una respuesta concreta del motor, con tope: si se pierde, la cola no
   *  puede quedarse esperando para siempre y bloquear todo lo que venga detrás. */
  private esperar(w: Worker, respuesta: string, pedir: () => void): Promise<void> {
    return new Promise<void>((cumplir, fallar) => {
      const reloj = setTimeout(() => {
        w.removeEventListener("message", alMensaje);
        fallar(new Error(`El motor no contesta ${respuesta}`));
      }, ESPERA_RESPUESTA);
      const alMensaje = (e: MessageEvent) => {
        if (String(e.data ?? "").trim() !== respuesta) return;
        clearTimeout(reloj);
        w.removeEventListener("message", alMensaje);
        cumplir();
      };
      w.addEventListener("message", alMensaje);
      pedir();
    });
  }

  parar(): void {
    this.generacion++;
    this.enMarcha = false;
    this.escucha = null;
    this.w?.postMessage("stop");
  }

  cerrar(): void {
    this.generacion++;
    this.enMarcha = false;
    this.escucha = null;
    this.w?.terminate();
    this.w = null;
  }
}
