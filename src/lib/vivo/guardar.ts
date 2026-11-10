import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { aPgn, type Estado } from "@/lib/vivo/partida";
import { difundirChat, difundirPartida, difundirTorneo } from "@/lib/vivo/difundir";

/**
 * Lo que hace falta para GUARDAR un cambio en una partida en vivo y rematarlo: el mapeo
 * entre la fila y el estado, escribir y avisar a la mesa, apuntar en el chat y cerrar
 * el emparejamiento del torneo.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN `jugar/actions.ts`, donde nació: aquel fichero es
 * `"use server"`, y en un fichero así TODA función exportada es una acción de servidor
 * que cualquiera puede llamar desde el navegador con los argumentos que quiera.
 * Exportar `cerrarEnElTorneo` desde allí para usarla en el cron habría dejado a
 * cualquier socio apuntarse un resultado en el torneo. Este módulo es de servidor
 * normal: lo importan las acciones (que comprueban quién eres antes de llamarlo) y el
 * cierre automático de partidas abandonadas (`abandonadas.ts`, desde el cron).
 *
 * NO COMPRUEBA PERMISOS: escribe con la clave de servicio lo que le digan. Esa
 * comprobación es de quien llama, y por eso nada de aquí puede acabar en un fichero
 * `"use server"` ni en un componente de cliente.
 */

/** Fila tal como se guarda, para no repetir el mapeo en cada acción. */
export type Fila = {
  id: string;
  /** Cuándo se abrió la mesa. Es la referencia del cron cuando nadie ha movido. */
  creada_en: string;
  blancas_id: string;
  negras_id: string;
  jugadas: string[];
  turno: "w" | "b";
  blancas_ms: number;
  negras_ms: number;
  base_ms: number;
  incremento_ms: number;
  ultima_jugada_en: string | null;
  resultado: string | null;
  motivo: string | null;
  club_pairing_id: string | null;
  tablas_ofrecidas_por: string | null;
  vuelta_pedida_por: string | null;
};

export function aEstado(f: Fila): Estado {
  return {
    jugadas: f.jugadas ?? [],
    cadencia: { baseMs: f.base_ms, incrementoMs: f.incremento_ms },
    reloj: {
      blancasMs: f.blancas_ms,
      negrasMs: f.negras_ms,
      turno: f.turno,
      ultimaJugadaEn: f.ultima_jugada_en ? Date.parse(f.ultima_jugada_en) : null,
    },
    resultado: (f.resultado as Estado["resultado"]) ?? null,
    motivo: (f.motivo as Estado["motivo"]) ?? null,
  };
}

/** Lo que hay que escribir de un estado. Se guarda entero para que la fila y la
 *  lógica no puedan discrepar. */
export function aFila(e: Estado) {
  return {
    jugadas: e.jugadas,
    turno: e.reloj.turno,
    blancas_ms: e.reloj.blancasMs,
    negras_ms: e.reloj.negrasMs,
    // AL TERMINAR, EL RELOJ SE PARA. `ultima_jugada_en` es lo que le dice al
    // navegador "sigue contando desde aquí": dejarla puesta en una partida acabada
    // hacía que el tablero final enseñara los milisegundos del instante de la última
    // jugada, o sea más tiempo del que quedaba de verdad.
    ultima_jugada_en:
      e.resultado !== null || e.reloj.ultimaJugadaEn === null
        ? null
        : new Date(e.reloj.ultimaJugadaEn).toISOString(),
    resultado: e.resultado,
    motivo: e.motivo,
    terminada_en: e.resultado ? new Date().toISOString() : null,
    // Cualquier jugada mata una oferta de tablas viva: aceptar unas tablas que se
    // ofrecieron hace cinco jugadas no es lo que nadie espera. Lo mismo con la
    // petición de volver: si la partida ha seguido, ya no hay nada que deshacer.
    tablas_ofrecidas_por: null,
    vuelta_pedida_por: null,
  };
}

/**
 * Lo que hay que hacer cuando una partida de TORNEO se acaba: escribir el resultado
 * en el emparejamiento y dejar el PGN en el repositorio.
 *
 * SE LLAMA DESDE TODOS LOS FINALES —mate, tiempo, abandono, tablas—, porque una
 * partida se puede acabar de muchas maneras y el torneo tiene que enterarse de
 * todas. El ELO del club no hay que tocarlo: se recalcula solo desde los
 * emparejamientos.
 *
 * Es idempotente: si el emparejamiento ya tiene resultado no se pisa, porque el
 * organizador puede haberlo corregido a mano y su palabra vale más que esto.
 */
export async function cerrarEnElTorneo(
  db: ReturnType<typeof createAdminClient>,
  fila: Fila,
  resultado: string
): Promise<void> {
  if (!fila.club_pairing_id) return;

  // `club_pairings.resultado` se guarda DESDE LAS BLANCAS, igual que en toda la app.
  const desdeBlancas = resultado === "1-0" ? "1" : resultado === "0-1" ? "0" : "0.5";

  // EL EMPAREJAMIENTO SE RECLAMA DE UNA VEZ, con una sola escritura condicionada, y no
  // "leer si está libre y luego escribir". Leyendo primero, dos cierres a la vez —el
  // cron de abandonadas y el jugador que reclama, o dos jugadores que abandonan y
  // reclaman en el mismo instante— veían los dos el emparejamiento vacío y metían DOS
  // veces el PGN en el repositorio. Así solo uno consigue la fila; el otro sale sin
  // hacer nada. Y si ya tenía resultado (el organizador lo corrigió a mano), tampoco se
  // pisa: su palabra vale más que esto.
  const { data: par, error: errorReclamar } = await db
    .from("club_pairings")
    .update({ resultado: desdeBlancas })
    .eq("id", fila.club_pairing_id)
    .is("resultado", null)
    .select("id, round_id")
    .maybeSingle();
  if (errorReclamar) {
    console.error("[torneo] no se pudo apuntar el resultado", fila.club_pairing_id, errorReclamar.message);
    return;
  }
  if (!par) return;

  // El PGN, al repositorio. La partida se guarda a nombre del jugador de blancas:
  // la base lleva una fila por dueño, y duplicarla para los dos dejaría la misma
  // partida dos veces en las búsquedas.
  const { data: nombres } = await db
    .from("players")
    .select("id, nombre")
    .in("id", [fila.blancas_id, fila.negras_id]);
  const nombre = new Map((nombres ?? []).map((n) => [n.id, n.nombre as string]));

  const { data: ronda } = await db
    .from("club_rounds")
    .select("numero, tournament_id, club_tournaments(nombre)")
    .eq("id", par.round_id)
    .maybeSingle();
  const nombreTorneo =
    (ronda?.club_tournaments as unknown as { nombre: string } | null)?.nombre ??
    "Torneo del club";
  const hoy = new Date().toISOString().slice(0, 10);

  // EL RESULTADO SE PASA A MANO. `fila` es la partida tal como estaba ANTES de
  // cerrarla, así que su `resultado` todavía es null y el PGN salía con `[Result
  // "*"]` y terminado en asterisco — una partida ganada guardada como inacabada.
  // Pasó de verdad con la primera partida de prueba.
  const estadoFinal: Estado = {
    ...aEstado(fila),
    resultado: resultado as Estado["resultado"],
  };

  const pgn = aPgn(estadoFinal, {
    blancas: nombre.get(fila.blancas_id) ?? "Socio",
    negras: nombre.get(fila.negras_id) ?? "Socio",
    fecha: hoy,
    evento: nombreTorneo,
  });

  const { data: guardada, error: errorPgn } = await db
    .from("games")
    .insert({
      player_id: fila.blancas_id,
      fecha: hoy,
      ronda: ronda?.numero ?? null,
      rival_nombre: nombre.get(fila.negras_id) ?? "Socio",
      rival_id: fila.negras_id,
      color: "blancas",
      resultado: desdeBlancas,
      torneo_texto: nombreTorneo,
      pgn,
    })
    .select("id")
    .single();

  // EL RESULTADO YA ESTÁ APUNTADO (arriba) AUNQUE EL PGN FALLE: la clasificación del
  // torneo no puede quedarse esperando a que el repositorio funcione. Pero el fallo se
  // TRAZA — antes se tragaba en silencio ("Importante — Silencios" de la auditoría del
  // 2026-08-10) y "el torneo tiene resultado pero no partida" era indistinguible de un
  // torneo al que nadie subió nada.
  if (errorPgn || !guardada) {
    console.error(
      "[torneo] el resultado quedó apuntado pero el PGN no entró en el repositorio",
      fila.club_pairing_id,
      errorPgn?.message ?? "insert sin fila devuelta"
    );
  } else {
    await db.from("club_pairings").update({ game_id: guardada.id }).eq("id", par.id);
  }

  // A quien esté MIRANDO la pantalla del torneo, en vivo: el revalidate de abajo
  // solo refresca la siguiente navegación, no al que ya la tiene delante.
  if (ronda?.tournament_id) await difundirTorneo(ronda.tournament_id);

  revalidatePath("/club/jugar/torneos");
  revalidatePath("/club/jugar/torneos/ranking");
}

/**
 * Deja constancia en el chat de algo que ha pasado en la partida.
 *
 * POR QUÉ SE GUARDA Y NO SE PINTA Y YA: si el rival dice que no a unas tablas, la
 * tarjeta desaparece y sin esto no queda ni rastro — parece que el mensaje se haya
 * perdido. Escrito en el chat, los dos ven qué se pidió y qué se contestó, y sigue
 * ahí al volver a la partida.
 *
 * Lo escribe el SERVIDOR con clave de servicio, así que la política del chat no
 * cambia: el cliente sigue sin poder escribir en nombre de nadie.
 */
export async function apuntarEnElChat(
  db: ReturnType<typeof createAdminClient>,
  partidaId: string,
  evento: string,
  texto: string
): Promise<void> {
  try {
    const { data } = await db
      .from("live_chat")
      .insert({ live_game_id: partidaId, player_id: null, evento, texto })
      .select("id, player_id, texto, evento, creado_en")
      .single();
    if (data) await difundirChat(partidaId, data as Record<string, unknown>);
  } catch {
    // Que no se pueda apuntar no puede tumbar la jugada, que ya está hecha.
  }
}

/**
 * Guarda el cambio y AVISA a la mesa por difusión.
 *
 * Las dos cosas juntas y en una sola función para que no se pueda escribir un
 * cambio sin avisarlo: cada vez que eso pasara, los dos jugadores se quedarían
 * esperando al reintento sin saber por qué.
 */
export async function guardarYAvisar(
  db: ReturnType<typeof createAdminClient>,
  partidaId: string,
  cambio: Record<string, unknown>,
  opciones: { soloSiSigueIgual?: { ultimaJugadaEn: string } } = {}
): Promise<Record<string, unknown> | null> {
  let cambiar = db.from("live_games").update(cambio).eq("id", partidaId);
  // `soloSiSigueIgual`: el cambio solo entra si la partida está EXACTAMENTE como se
  // leyó —sin resultado y con la misma última jugada—. Lo usa el cierre automático
  // (`abandonadas.ts`), que escribe sin que nadie lo pida a partir de una fila leída
  // antes: si mientras tanto alguien la cerró, movió o devolvió una jugada, escribir
  // pisaría ese cambio con la foto vieja. En ese caso no se toca nada y se devuelve
  // null, así que quien llama sabe que el remate (chat y torneo) no le toca.
  if (opciones.soloSiSigueIgual) {
    cambiar = cambiar
      .is("resultado", null)
      .eq("ultima_jugada_en", opciones.soloSiSigueIgual.ultimaJugadaEn);
  }
  const { data, error } = await cambiar.select("*").maybeSingle();
  // Un fallo de la base no puede confundirse con "no había nada que cambiar": si no, un
  // error que se repite dejaría la partida sin guardar todos los días sin rastro.
  if (error) console.error("[partidas] no se pudo guardar el cambio", partidaId, error.message);
  if (data) await difundirPartida(partidaId, data as Record<string, unknown>);
  return (data as Record<string, unknown> | null) ?? null;
}

/** Nombre de una ficha, para escribirlo en el chat. */
export async function nombreDe(
  db: ReturnType<typeof createAdminClient>,
  playerId: string
): Promise<string> {
  const { data } = await db.from("players").select("nombre").eq("id", playerId).maybeSingle();
  return (data?.nombre as string | undefined) ?? "Un socio";
}
