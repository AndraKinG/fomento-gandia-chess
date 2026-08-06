import { createAdminClient } from "@/lib/supabase/admin";
import { parseEloFideDesdePerfil } from "@/lib/import/fide";

/**
 * Cuántos perfiles se piden a la vez.
 *
 * Antes se pedían de uno en uno con 500 ms de espera entre cada uno: con los 48
 * jugadores que tienen id FIDE eso son 33 segundos largos, medidos. Cinco a la vez
 * lo baja a unos 4, y cinco peticiones simultáneas para una acción manual que se
 * usa una vez al mes no es abusar de nadie.
 */
const SIMULTANEAS = 5;

/** Cortesía entre peticiones DE UN MISMO hilo, no global. */
const ESPERA_MS = 150;

/**
 * Tiempo límite por perfil.
 *
 * Es la parte importante del arreglo: `fetch` sin límite se queda esperando para
 * siempre, y como fide.com bloquea las IPs de centro de datos, en producción la
 * acción no fallaba — se colgaba, y con ella la pantalla, hasta que el usuario
 * recargaba. Con límite, lo peor que pasa es que tarde 8 segundos en decir que no
 * ha podido.
 */
const LIMITE_MS = 8000;

type Jugador = { id: string; fide_id: string | null };

/**
 * Lógica interna (sin gate de autorización) que recorre los jugadores con
 * `fide_id` asignado, consulta su perfil en ratings.fide.com y actualiza su
 * ELO FIDE.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/club/(vinculado)/admin/elo/actions.ts`)
 * o que la petición trae el `CRON_SECRET` válido (ver
 * `src/app/api/cron/elo-fide/route.ts`).
 */
export async function actualizarEloFideCore(): Promise<{
  actualizados: number;
  errores: number;
  detalle?: string[];
}> {
  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players")
    .select("id, fide_id")
    .not("fide_id", "is", null);

  const pendientes: Jugador[] = [...(players ?? [])];
  let actualizados = 0;
  let errores = 0;
  const detalle: string[] = [];

  const anotarError = (mensaje: string) => {
    errores++;
    if (detalle.length < 3) detalle.push(mensaje);
  };

  /**
   * Un hilo de trabajo: va cogiendo jugadores de la lista compartida hasta
   * agotarla. `shift()` sobre el array es seguro aquí porque JavaScript no
   * interrumpe una función a mitad: entre el `shift` y el `await` no puede
   * colarse otro hilo.
   */
  async function trabajar(): Promise<void> {
    for (;;) {
      const p = pendientes.shift();
      if (!p) return;

      try {
        const res = await fetch(`https://ratings.fide.com/profile/${p.fide_id}`, {
          headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
          signal: AbortSignal.timeout(LIMITE_MS),
        });
        if (!res.ok) {
          anotarError(`${p.fide_id}: HTTP ${res.status}`);
        } else {
          const elo = parseEloFideDesdePerfil(await res.text());
          if (elo !== null) {
            await admin.from("players").update({ elo_fide: elo }).eq("id", p.id);
            actualizados++;
          } else {
            anotarError(`${p.fide_id}: sin rating en el HTML`);
          }
        }
      } catch (e) {
        // Un tiempo límite agotado llega aquí como TimeoutError, que es
        // exactamente lo que pasa cuando fide.com bloquea la IP.
        anotarError(`${p.fide_id}: ${String(e).slice(0, 120)}`);
      }

      if (pendientes.length > 0) {
        await new Promise((r) => setTimeout(r, ESPERA_MS));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SIMULTANEAS, pendientes.length) }, trabajar)
  );

  return { actualizados, errores, ...(detalle.length ? { detalle } : {}) };
}
