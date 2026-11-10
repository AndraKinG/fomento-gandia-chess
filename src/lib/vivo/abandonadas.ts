import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { abandonadaPorTiempo, reclamarTiempo } from "@/lib/vivo/partida";
import {
  aEstado,
  aFila,
  apuntarEnElChat,
  cerrarEnElTorneo,
  guardarYAvisar,
  nombreDe,
  type Fila,
} from "@/lib/vivo/guardar";

/**
 * Cierra por tiempo las partidas en vivo que se han quedado abandonadas.
 *
 * EL PROBLEMA: el servidor no tiene un reloj que suene solo. Una partida se cierra por
 * tiempo cuando llega una jugada tarde o cuando alguien pulsa "reclamar"; si los dos
 * jugadores se van, no pasa ninguna de las dos cosas y la partida se queda "en juego"
 * para siempre en las listas. La auditoría del 2026-11-10 encontró una así: un reto a
 * 5 minutos con una sola jugada, abierto desde hacía seis días.
 *
 * LA REGLA ES LA DEL BOTÓN, no una nueva. El cierre lo hace `reclamarTiempo`, la misma
 * función que usa "reclamar por tiempo", así que el resultado es exactamente el que
 * habría salido si quien esperaba lo hubiera pulsado: gana el rival de quien se quedó
 * sin tiempo, y si la partida es de un torneo, el resultado va al emparejamiento y el
 * PGN al repositorio como en cualquier otro final.
 *
 * LO QUE NO CIERRA: las partidas cuyo reloj nunca ha arrancado (nadie ha movido). El
 * reloj no arranca hasta la primera jugada, así que ahí la bandera no puede caer y no
 * hay a quién darle la partida. Se quedan abiertas a propósito (ver
 * `abandonadaPorTiempo`).
 *
 * Lo llama el cron director en cada pasada —la diaria y las tres del fin de semana de
 * jornada—, junto al reintento de avisos: es otra red de seguridad, no una tarea con
 * día de la semana.
 */

/**
 * Cierra UNA partida si está abandonada. Devuelve true si la ha cerrado.
 *
 * SE ESCRIBE CON `soloSiSigueIgual`: la fila se leyó al principio de la pasada, y entre
 * medias alguien puede haberla cerrado, haber movido o haber devuelto una jugada. Si ha
 * cambiado, aquí no se toca nada — ni la fila, ni el chat, ni el torneo —, y la pasada
 * siguiente la mirará otra vez con la foto buena. Y aunque el jugador reclame justo
 * después y vuelva a cerrarla, `cerrarEnElTorneo` reclama el emparejamiento de una vez:
 * el PGN no entra dos veces en el repositorio.
 */
export async function cerrarSiAbandonada(
  db: ReturnType<typeof createAdminClient>,
  fila: Fila,
  ahora: number
): Promise<boolean> {
  const estado = aEstado(fila);
  if (!abandonadaPorTiempo(estado, ahora)) return false;

  const cerrada = reclamarTiempo(estado, ahora);
  if (!cerrada?.resultado) return false;

  // `abandonadaPorTiempo` ya garantiza que el reloj corre, o sea que hay última jugada.
  if (!fila.ultima_jugada_en) return false;
  const guardada = await guardarYAvisar(db, fila.id, aFila(cerrada), {
    soloSiSigueIgual: { ultimaJugadaEn: fila.ultima_jugada_en },
  });
  if (!guardada) return false;

  // EN EL CHAT, PARA QUIEN VUELVA: sin esto, el que se fue se encuentra un "perdida por
  // tiempo" que no recuerda haber perdido. A quien se le acabó el tiempo es a quien le
  // tocaba mover, que es lo mismo que mira `reclamarTiempo`.
  const sinTiempo = estado.reloj.turno === "w" ? fila.blancas_id : fila.negras_id;
  await apuntarEnElChat(
    db,
    fila.id,
    "tiempo",
    `Se acabó el tiempo de ${await nombreDe(db, sinTiempo)} y nadie reclamó la partida, así que se ha cerrado sola.`
  );
  await cerrarEnElTorneo(db, fila, cerrada.resultado);
  return true;
}

/**
 * Recorre las partidas abiertas y cierra las abandonadas. NUNCA LANZA: va en el cron
 * antes que la tarea del día, y un fallo aquí no puede dejar sin hacer la sync del
 * domingo ni la petición de disponibilidad del lunes.
 */
export async function cerrarPartidasAbandonadas(
  ahora: number = Date.now()
): Promise<{ cerradas: number }> {
  try {
    const db = createAdminClient();
    // Solo las que tienen el reloj arrancado: las demás no pueden estar abandonadas por
    // tiempo y no hace falta ni traerlas.
    const { data, error } = await db
      .from("live_games")
      .select("*")
      .is("resultado", null)
      .not("ultima_jugada_en", "is", null);
    if (error) {
      console.error("[partidas] no se pudieron leer las partidas abiertas", error.message);
      return { cerradas: 0 };
    }

    const cerradas: string[] = [];
    for (const fila of (data ?? []) as Fila[]) {
      // Una partida que falla no impide cerrar las demás.
      try {
        if (await cerrarSiAbandonada(db, fila, ahora)) cerradas.push(fila.id);
      } catch (e) {
        console.error("[partidas] no se pudo cerrar", fila.id, e instanceof Error ? e.message : e);
      }
    }

    if (cerradas.length > 0) {
      revalidatePath("/club/jugar");
      for (const id of cerradas) revalidatePath(`/club/jugar/${id}`);
    }
    return { cerradas: cerradas.length };
  } catch (e) {
    console.error("[partidas] el cierre de abandonadas falló", e instanceof Error ? e.message : e);
    return { cerradas: 0 };
  }
}
