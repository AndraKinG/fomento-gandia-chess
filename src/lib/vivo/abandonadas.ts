import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinoDeAbandonada, reclamarTiempo } from "@/lib/vivo/partida";
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
 * Lo que se hace con las partidas en vivo que se han quedado abandonadas.
 *
 * EL PROBLEMA: el servidor no tiene un reloj que suene solo. Una partida se cierra por
 * tiempo cuando llega una jugada tarde o cuando alguien pulsa "reclamar"; si los dos
 * jugadores se van, no pasa ninguna de las dos cosas y la partida se queda "en juego"
 * para siempre en las listas. La auditoría del 2026-11-10 encontró una así: un reto a
 * 5+3 con una sola jugada, abierto desde hacía seis días.
 *
 * DOS DESTINOS, según si la partida llegó a empezar (`destinoDeAbandonada`):
 * - **Empezada** (los dos han movido): se CIERRA por tiempo con `reclamarTiempo`, la
 *   misma función del botón, así que sale lo que habría salido si quien esperaba lo
 *   hubiera pulsado. Nota en el chat y, si es de torneo, resultado al emparejamiento y
 *   PGN al repositorio como en cualquier final.
 * - **Sin empezar** (alguno no hizo su primera jugada): se ANULA y se BORRA, decisión
 *   del propietario (2026-11-10). Con ella se van su chat (en cascada) y el enlace del
 *   reto (`set null`). Si era de torneo, el emparejamiento se queda SIN resultado y se
 *   puede volver a abrir la mesa: qué hacer con una incomparecencia lo decide el
 *   organizador, no el cron.
 *
 * Lo llama el cron director en cada pasada —la diaria y las tres del fin de semana de
 * jornada—, junto al reintento de avisos: es otra red de seguridad, no una tarea con
 * día de la semana.
 */

export type Atendida = "nada" | "cerrada" | "anulada";

/**
 * Atiende UNA partida: la deja, la cierra o la anula.
 *
 * TODO SE ESCRIBE SOLO SI LA PARTIDA SIGUE COMO SE LEYÓ (sin resultado y con la misma
 * última jugada): la fila se leyó al principio de la pasada, y entre medias alguien
 * puede haberla cerrado, haber movido o haber devuelto una jugada. Si ha cambiado, aquí
 * no se toca nada y la pasada siguiente la mira con la foto buena. Y si aun así dos
 * cierres coinciden, `cerrarEnElTorneo` reclama el emparejamiento de una vez: el PGN no
 * entra dos veces en el repositorio.
 */
export async function atenderAbandonada(
  db: ReturnType<typeof createAdminClient>,
  fila: Fila,
  ahora: number
): Promise<Atendida> {
  const estado = aEstado(fila);
  const destino = destinoDeAbandonada(estado, Date.parse(fila.creada_en), ahora);

  if (destino === "anular") {
    let borrar = db.from("live_games").delete().eq("id", fila.id).is("resultado", null);
    borrar = fila.ultima_jugada_en
      ? borrar.eq("ultima_jugada_en", fila.ultima_jugada_en)
      : borrar.is("ultima_jugada_en", null);
    const { data, error } = await borrar.select("id");
    if (error) {
      console.error("[partidas] no se pudo anular", fila.id, error.message);
      return "nada";
    }
    return (data ?? []).length > 0 ? "anulada" : "nada";
  }

  if (destino !== "cerrar" || !fila.ultima_jugada_en) return "nada";
  const cerrada = reclamarTiempo(estado, ahora);
  if (!cerrada?.resultado) return "nada";

  const guardada = await guardarYAvisar(db, fila.id, aFila(cerrada), {
    soloSiSigueIgual: { ultimaJugadaEn: fila.ultima_jugada_en },
  });
  if (!guardada) return "nada";

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
  return "cerrada";
}

/**
 * Recorre las partidas abiertas y atiende las abandonadas. NUNCA LANZA: va en el cron
 * antes que la tarea del día, y un fallo aquí no puede dejar sin hacer la sync del
 * domingo ni la petición de disponibilidad del lunes.
 */
export async function atenderPartidasAbandonadas(
  ahora: number = Date.now()
): Promise<{ cerradas: number; anuladas: number }> {
  try {
    const db = createAdminClient();
    // TODAS las abiertas, también las que no han arrancado el reloj: esas son justo las
    // que se anulan. Son pocas siempre (el índice parcial de 0022 es `resultado is null`).
    const { data, error } = await db.from("live_games").select("*").is("resultado", null);
    if (error) {
      console.error("[partidas] no se pudieron leer las partidas abiertas", error.message);
      return { cerradas: 0, anuladas: 0 };
    }

    let cerradas = 0;
    let anuladas = 0;
    const tocadas: string[] = [];
    for (const fila of (data ?? []) as Fila[]) {
      // Una partida que falla no impide atender las demás.
      try {
        const r = await atenderAbandonada(db, fila, ahora);
        if (r === "cerrada") cerradas++;
        if (r === "anulada") anuladas++;
        if (r !== "nada") tocadas.push(fila.id);
      } catch (e) {
        console.error("[partidas] no se pudo atender", fila.id, e instanceof Error ? e.message : e);
      }
    }

    if (tocadas.length > 0) {
      revalidatePath("/club/jugar");
      for (const id of tocadas) revalidatePath(`/club/jugar/${id}`);
    }
    return { cerradas, anuladas };
  } catch (e) {
    console.error("[partidas] la atención de abandonadas falló", e instanceof Error ? e.message : e);
    return { cerradas: 0, anuladas: 0 };
  }
}
