/**
 * Peticiones a webs externas con tiempo límite.
 *
 * POR QUÉ EXISTE ESTE FICHERO: ninguno de los importadores tenía límite, y un
 * `fetch` sin límite espera para siempre. Con fide.com bloqueando las IPs de
 * centro de datos, en producción las acciones de actualizar ELO no fallaban —se
 * colgaban, y con ellas la pantalla, hasta que el usuario recargaba. Lo mismo
 * podía pasar con cualquier sincronización de la FACV si su web tardaba.
 *
 * Todas las llamadas a fuentes externas deben pasar por aquí.
 */

/** Perfil de FIDE o página HTML pequeña: si tarda más, es que no va a contestar. */
export const LIMITE_PAGINA_MS = 15_000;

/** Páginas grandes de la FACV (el calendario de torneos son ~600 KB). */
export const LIMITE_PAGINA_GRANDE_MS = 30_000;

/** Descargas de ficheros (la lista FEDA en .xlsx pasa de 3 MB). */
export const LIMITE_FICHERO_MS = 60_000;

/**
 * `fetch` con tiempo límite y user-agent por defecto.
 *
 * Al agotarse el límite lanza `TimeoutError`, que es lo que hay que dejar
 * escapar hasta el `catch` de cada importador para que lo cuente como error en
 * vez de quedarse esperando.
 */
export function fetchConLimite(
  url: string,
  opciones: { headers?: Record<string, string>; limiteMs?: number } = {}
): Promise<Response> {
  const { headers, limiteMs = LIMITE_PAGINA_MS } = opciones;
  return fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", ...headers },
    signal: AbortSignal.timeout(limiteMs),
  });
}

/**
 * Ejecuta trabajos en paralelo con un tope de simultáneos.
 *
 * Los importadores que piden una página por jugador lo hacían de uno en uno, y
 * con 48 jugadores eso son más de 30 segundos medidos. Con tope de simultáneos
 * baja a unos pocos, sin llegar a martillear la web de origen.
 *
 * `tareas` se consume con `shift()`, que es seguro porque JavaScript no
 * interrumpe una función a mitad: entre el `shift` y el `await` no se cuela otro
 * hilo.
 */
export async function enParalelo<T>(
  tareas: (() => Promise<T>)[],
  simultaneas: number,
  esperaEntreMs = 0
): Promise<T[]> {
  const pendientes = [...tareas];
  const resultados: T[] = [];

  async function trabajar(): Promise<void> {
    for (;;) {
      const tarea = pendientes.shift();
      if (!tarea) return;
      resultados.push(await tarea());
      if (esperaEntreMs > 0 && pendientes.length > 0) {
        await new Promise((r) => setTimeout(r, esperaEntreMs));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(simultaneas, pendientes.length)) }, trabajar)
  );
  return resultados;
}
