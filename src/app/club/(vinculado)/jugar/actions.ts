"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionActual } from "@/lib/auth/sesion";
import {
  aplicarJugada,
  finPorAbandono,
  reclamarTiempo,
  type Estado,
  type Jugada,
} from "@/lib/vivo/partida";
import { parado, relojInicial } from "@/lib/vivo/reloj";
import { blancasEnAmistosa } from "@/lib/vivo/colores";
import { aPgn } from "@/lib/vivo/partida";
import { enviarPushAMuchos } from "@/lib/push/send";
import { difundirAviso, difundirChat, difundirPartida } from "@/lib/vivo/difundir";

/**
 * Todo lo que cambia una partida en vivo.
 *
 * **ÚNICA PUERTA.** No hay ninguna política de escritura sobre `live_games`
 * (migración 0022), así que la partida solo se toca desde aquí, con la clave de
 * servicio y después de comprobar tres cosas en este orden: que eres tú, que es tu
 * turno y que te queda tiempo. Si esto se pudiera hacer desde el navegador,
 * cualquiera con la clave anónima se pondría un 1-0.
 *
 * EL "AHORA" LO PONE EL SERVIDOR, siempre. Nunca llega en la petición: un reloj que
 * acepta la hora del cliente no es un reloj.
 */

type Respuesta = { error?: string; id?: string };

/** Fila tal como se guarda, para no repetir el mapeo en cada acción. */
type Fila = {
  id: string;
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

function aEstado(f: Fila): Estado {
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
function aFila(e: Estado) {
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
async function cerrarEnElTorneo(
  db: ReturnType<typeof createAdminClient>,
  fila: Fila,
  resultado: string
): Promise<void> {
  if (!fila.club_pairing_id) return;

  const { data: par } = await db
    .from("club_pairings")
    .select("id, resultado, game_id, round_id")
    .eq("id", fila.club_pairing_id)
    .maybeSingle();
  if (!par || par.resultado !== null) return;

  // `club_pairings.resultado` se guarda DESDE LAS BLANCAS, igual que en toda la app.
  const desdeBlancas = resultado === "1-0" ? "1" : resultado === "0-1" ? "0" : "0.5";

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
    .select("numero, club_tournaments(nombre)")
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

  const { data: guardada } = await db
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

  await db
    .from("club_pairings")
    .update({ resultado: desdeBlancas, game_id: guardada?.id ?? par.game_id })
    .eq("id", par.id);

  revalidatePath("/club/torneos/interno");
  revalidatePath("/club/torneos/interno/ranking");
}

/**
 * Refresca las pantallas de servidor.
 *
 * NO SE LLAMA AL MOVER, y es deliberado: `revalidatePath` obliga a Next a rehacer la
 * página entera en el servidor, y hacerlo en cada jugada añadía cientos de
 * milisegundos a cada movimiento de una partida a 3+2. La mesa se entera por tiempo
 * real, que para eso está. Solo se refresca cuando la partida CAMBIA DE ESTADO
 * —empieza o termina—, que es lo que ven las listas.
 */
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
async function apuntarEnElChat(
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

function refrescar(id: string): void {
  revalidatePath("/club/jugar");
  revalidatePath(`/club/jugar/${id}`);
}

/**
 * Guarda el cambio y AVISA a la mesa por difusión.
 *
 * Las dos cosas juntas y en una sola función para que no se pueda escribir un
 * cambio sin avisarlo: cada vez que eso pasara, los dos jugadores se quedarían
 * esperando al reintento sin saber por qué.
 */
async function guardarYAvisar(
  db: ReturnType<typeof createAdminClient>,
  partidaId: string,
  cambio: Record<string, unknown>
): Promise<void> {
  const { data } = await db
    .from("live_games")
    .update(cambio)
    .eq("id", partidaId)
    .select("*")
    .maybeSingle();
  if (data) await difundirPartida(partidaId, data as Record<string, unknown>);
}

/**
 * Los relojes CONGELADOS en este instante, para guardarlos al cerrar una partida
 * que se acaba sin jugada: abandono o tablas acordadas.
 *
 * Sin esto la fila conserva los milisegundos del instante de la última jugada y el
 * tablero final enseña más tiempo del que quedaba —los dos relojes daban un salto
 * hacia arriba justo al terminar.
 */
function relojParado(fila: Fila) {
  const r = parado(aEstado(fila).reloj, Date.now());
  return { blancas_ms: r.blancasMs, negras_ms: r.negrasMs, ultima_jugada_en: null };
}

/** Nombre de una ficha, para escribirlo en el chat. */
async function nombreDe(
  db: ReturnType<typeof createAdminClient>,
  playerId: string
): Promise<string> {
  const { data } = await db.from("players").select("nombre").eq("id", playerId).maybeSingle();
  return (data?.nombre as string | undefined) ?? "Un socio";
}

/** Carga la partida y dice de qué color juega esta persona, o null si no es suya. */
async function miPartida(id: string, playerId: string) {
  const db = createAdminClient();
  const { data } = await db.from("live_games").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const fila = data as Fila;
  const color: "w" | "b" | null =
    fila.blancas_id === playerId ? "w" : fila.negras_id === playerId ? "b" : null;
  return { db, fila, color };
}

/** Reta a otro socio. La cadencia se dice como la dice la gente: "5+3". */
export async function retar(datos: {
  aQuien: string;
  baseMin: number;
  incrementoS: number;
  color: string;
}): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "Necesitas tener ficha del club." };
  if (datos.aQuien === sesion.playerId) return { error: "No puedes retarte a ti mismo." };

  const base = Math.round(datos.baseMin);
  const incremento = Math.round(datos.incrementoS);
  if (!(base >= 1 && base <= 180)) return { error: "El tiempo va de 1 a 180 minutos." };
  if (!(incremento >= 0 && incremento <= 60)) {
    return { error: "El incremento va de 0 a 60 segundos." };
  }
  const color = ["blancas", "negras", "azar"].includes(datos.color) ? datos.color : "azar";

  const db = createAdminClient();
  // SE COMPRUEBA AQUÍ TAMBIÉN, y no solo escondiendo la opción en la lista: un reto
  // a una ficha sin cuenta no lo puede aceptar nadie y se queda colgado para
  // siempre. Esconder algo de la pantalla no es una comprobación.
  const { data: tieneCuenta } = await db
    .from("profiles")
    .select("id")
    .eq("player_id", datos.aQuien)
    .maybeSingle();
  if (!tieneCuenta) {
    return { error: "Ese socio todavía no tiene cuenta en la app." };
  }
  const { data, error } = await db
    .from("challenges")
    .insert({
      reta_id: sesion.playerId,
      retado_id: datos.aQuien,
      base_min: base,
      incremento_s: incremento,
      color,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No se ha podido mandar el reto." };

  await difundirAviso(datos.aQuien, { que: "nuevo" });
  revalidatePath("/club/jugar");
  return { id: data.id };
}

/**
 * Acepta un reto y crea la partida.
 *
 * LOS COLORES SE REPARTEN AQUÍ, en el servidor: si el azar lo tirara el navegador,
 * el que reta elegiría color siempre. La regla la pone `blancasEnAmistosa` — se
 * sortea la primera vez que se ven esos dos y a partir de ahí se alterna.
 */
export async function aceptarReto(retoId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "Necesitas tener ficha del club." };

  const db = createAdminClient();
  const { data: reto } = await db
    .from("challenges")
    .select("id, reta_id, retado_id, base_min, incremento_s, color, estado")
    .eq("id", retoId)
    .maybeSingle();
  if (!reto) return { error: "Ese reto ya no existe." };
  if (reto.retado_id !== sesion.playerId) return { error: "Ese reto no es para ti." };
  if (reto.estado !== "pendiente") return { error: "Ese reto ya está resuelto." };

  // El último encuentro AMISTOSO entre estos dos, que es lo que decide la
  // alternancia. Las de torneo no cuentan: allí el color lo reparte el
  // emparejador con el criterio oficial y no forma serie con las amistosas.
  const { data: anteriores } = await db
    .from("live_games")
    .select("blancas_id, negras_id")
    .eq("origen", "reto")
    .or(
      `and(blancas_id.eq.${reto.reta_id},negras_id.eq.${reto.retado_id}),` +
        `and(blancas_id.eq.${reto.retado_id},negras_id.eq.${reto.reta_id})`
    )
    .order("creada_en", { ascending: false })
    .limit(1);

  const ultimo = anteriores?.[0]
    ? { blancasId: anteriores[0].blancas_id as string, negrasId: anteriores[0].negras_id as string }
    : null;

  const conBlancas = blancasEnAmistosa({
    retaId: reto.reta_id,
    retadoId: reto.retado_id,
    quiere: reto.color as "blancas" | "negras" | "azar",
    ultimo,
    moneda: Math.random(),
  });
  const retaConBlancas = conBlancas === reto.reta_id;
  const cadencia = { baseMs: reto.base_min * 60_000, incrementoMs: reto.incremento_s * 1000 };
  const reloj = relojInicial(cadencia);

  const { data: partida, error } = await db
    .from("live_games")
    .insert({
      blancas_id: retaConBlancas ? reto.reta_id : reto.retado_id,
      negras_id: retaConBlancas ? reto.retado_id : reto.reta_id,
      origen: "reto",
      base_ms: cadencia.baseMs,
      incremento_ms: cadencia.incrementoMs,
      blancas_ms: reloj.blancasMs,
      negras_ms: reloj.negrasMs,
    })
    .select("id")
    .single();
  if (error || !partida) return { error: "No se ha podido crear la partida." };

  await db
    .from("challenges")
    .update({ estado: "aceptado", live_game_id: partida.id })
    .eq("id", retoId);

  // AL INSTANTE Y NO EN EL SIGUIENTE REPASO: el que acepta entra en el tablero
  // desde aquí mismo, así que cada segundo que tarde el otro es un segundo con la
  // partida abierta y un jugador solo delante del reloj.
  await difundirAviso(reto.reta_id, { que: "aceptado", partidaId: partida.id });

  // AVISO A QUIEN RETÓ, porque puede no estar mirando la pantalla de Jugar. Si
  // está, entra solo por tiempo real; si andaba en otra partida o navegando, esto
  // es lo único que le dice que su rival ya le espera con el reloj a punto.
  // En silencio si falla: la partida está creada y eso es lo que importa.
  try {
    const { data: quienReta } = await db
      .from("profiles")
      .select("id")
      .eq("player_id", reto.reta_id)
      .maybeSingle();
    const { data: yo } = await db
      .from("players")
      .select("nombre")
      .eq("id", sesion.playerId)
      .maybeSingle();
    if (quienReta?.id) {
      await enviarPushAMuchos([quienReta.id], {
        title: "Te han aceptado el reto",
        body: `${yo?.nombre ?? "Tu rival"} te espera en el tablero.`,
        url: `/club/jugar/${partida.id}`,
      });
    }
  } catch {
    // Silencio a propósito: ver comentario de arriba.
  }

  revalidatePath("/club/jugar");
  return { id: partida.id };
}

export async function rechazarReto(retoId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const db = createAdminClient();
  const { data: reto } = await db
    .from("challenges")
    .select("reta_id, retado_id, estado")
    .eq("id", retoId)
    .maybeSingle();
  if (!reto || reto.estado !== "pendiente") return { error: "Ese reto ya está resuelto." };

  // Quien lo recibe lo rechaza; quien lo manda lo cancela. Los dos lo cierran.
  const esMio = [reto.reta_id, reto.retado_id].includes(sesion.playerId);
  if (!esMio) return { error: "Ese reto no es tuyo." };

  const loCancelaQuienRetaba = reto.reta_id === sesion.playerId;
  await db
    .from("challenges")
    .update({ estado: loCancelaQuienRetaba ? "cancelado" : "rechazado" })
    .eq("id", retoId);

  // Se avisa al OTRO, que es el que se queda sin saber qué ha pasado: al que cancela
  // no hay nada que contarle. Sin esto, el reto desaparecía de la pantalla del
  // retado sin una palabra y parecía que se hubiera perdido.
  await difundirAviso(loCancelaQuienRetaba ? reto.retado_id : reto.reta_id, {
    que: loCancelaQuienRetaba ? "cancelado" : "rechazado",
  });
  revalidatePath("/club/jugar");
  return {};
}

/** Mueve. Es la acción que más veces se llama y la que más cosas comprueba. */
export async function mover(partidaId: string, jugada: Jugada): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia) return { error: "Esa partida no existe." };
  if (!mia.color) return { error: "Esa partida no es tuya." };

  const ahora = Date.now();
  const r = aplicarJugada(aEstado(mia.fila), mia.color, jugada, ahora);

  // Aunque la jugada se rechace puede haber cambiado la partida: si se le cayó la
  // bandera, la derrota se guarda igual. Por eso el estado se escribe si viene.
  if (!r.ok) {
    if (r.estado) {
      await guardarYAvisar(mia.db, partidaId, aFila(r.estado));
      refrescar(partidaId);
    }
    return { error: r.error };
  }

  await guardarYAvisar(mia.db, partidaId, aFila(r.estado));
  if (r.estado.resultado) {
    await cerrarEnElTorneo(
      mia.db,
      { ...mia.fila, jugadas: r.estado.jugadas },
      r.estado.resultado
    );
    refrescar(partidaId);
  }
  return {};
}

/** Abandona. Gana el rival, y se apunta por qué. */
export async function abandonar(partidaId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };

  const fin = finPorAbandono(mia.color);
  await apuntarEnElChat(
    mia.db,
    partidaId,
    "abandono",
    `${await nombreDe(mia.db, sesion.playerId)} abandona la partida.`
  );
  await guardarYAvisar(mia.db, partidaId, {
    ...relojParado(mia.fila),
    resultado: fin.resultado,
    motivo: fin.motivo,
    terminada_en: new Date().toISOString(),
    tablas_ofrecidas_por: null,
  });
  await cerrarEnElTorneo(mia.db, mia.fila, fin.resultado);
  refrescar(partidaId);
  return {};
}

/**
 * Ofrece tablas, o las retira si ya las había ofrecido.
 *
 * Que el mismo botón las retire evita el caso tonto de ofrecerlas sin querer y no
 * tener forma de deshacerlo. Y cualquier jugada las mata también (ver `aFila`).
 */
export async function ofrecerTablas(partidaId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };

  const yaLasOfreci = mia.fila.tablas_ofrecidas_por === sesion.playerId;
  // Si ya hay una oferta del RIVAL, este botón no puede pisarla: para eso están
  // aceptar y rechazar. Sin esta guarda, ofrecer encima de una oferta ajena la
  // convertía en tuya.
  if (mia.fila.tablas_ofrecidas_por && !yaLasOfreci) {
    return { error: "Tu rival ya te ha ofrecido tablas: acéptalas o dile que no." };
  }

  await guardarYAvisar(mia.db, partidaId, {
    tablas_ofrecidas_por: yaLasOfreci ? null : sesion.playerId,
  });
  if (!yaLasOfreci) {
    await apuntarEnElChat(
      mia.db,
      partidaId,
      "tablas-ofrecidas",
      `${await nombreDe(mia.db, sesion.playerId)} ofrece tablas.`
    );
  }
  refrescar(partidaId);
  return {};
}

/**
 * Acepta unas tablas.
 *
 * NO PUEDE ACEPTARLAS QUIEN LAS OFRECIÓ: si no, cualquiera se firmaría las tablas
 * él solo con dos clics.
 */
export async function aceptarTablas(partidaId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };

  const ofrecidasPor = mia.fila.tablas_ofrecidas_por;
  if (!ofrecidasPor) return { error: "Nadie ha ofrecido tablas." };
  if (ofrecidasPor === sesion.playerId) return { error: "Las has ofrecido tú." };

  await apuntarEnElChat(
    mia.db,
    partidaId,
    "tablas-aceptadas",
    `${await nombreDe(mia.db, sesion.playerId)} acepta las tablas.`
  );
  await guardarYAvisar(mia.db, partidaId, {
    ...relojParado(mia.fila),
    resultado: "1/2-1/2",
    motivo: "tablas-acordadas",
    terminada_en: new Date().toISOString(),
    tablas_ofrecidas_por: null,
  });
  await cerrarEnElTorneo(mia.db, mia.fila, "1/2-1/2");
  refrescar(partidaId);
  return {};
}

/**
 * Pide volver la última jugada atrás.
 *
 * SOLO LA PUEDE PEDIR QUIEN LA HIZO, o sea el que NO tiene el turno. Es la regla que
 * la hace justa y además la que evita el caso absurdo de pedir que se deshaga una
 * jugada del rival.
 *
 * No deshace nada por sí sola: deja la petición puesta y decide el otro.
 */
export async function pedirVolverJugada(partidaId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };
  if ((mia.fila.jugadas ?? []).length === 0) return { error: "Todavía no se ha jugado nada." };
  if (mia.fila.turno === mia.color) {
    return { error: "Solo puedes pedir volver TU última jugada." };
  }

  await guardarYAvisar(mia.db, partidaId, { vuelta_pedida_por: sesion.playerId });
  await apuntarEnElChat(
    mia.db,
    partidaId,
    "vuelta-pedida",
    `${await nombreDe(mia.db, sesion.playerId)} pide volver su última jugada.`
  );
  return {};
}

/**
 * Responde a la petición de volver una jugada.
 *
 * NO PUEDE RESPONDERLA QUIEN LA PIDIÓ, igual que con las tablas: si no, cualquiera
 * se desharía sus propias jugadas con dos clics.
 *
 * QUÉ PASA CON EL RELOJ al aceptar: los tiempos se quedan como están. El que pensó
 * esos segundos los pensó, y devolvérselos abriría la puerta a ganar tiempo pidiendo
 * volver jugadas. Lo único que se reinicia es la marca, para que el reloj empiece a
 * correrle a quien vuelve a tener el turno.
 */
export async function responderVolverJugada(
  partidaId: string,
  acepta: boolean
): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };

  const quienPidio = mia.fila.vuelta_pedida_por;
  if (!quienPidio) return { error: "Nadie ha pedido volver ninguna jugada." };
  if (quienPidio === sesion.playerId) return { error: "La has pedido tú." };

  if (!acepta) {
    await guardarYAvisar(mia.db, partidaId, { vuelta_pedida_por: null });
    await apuntarEnElChat(
      mia.db,
      partidaId,
      "vuelta-rechazada",
      `${await nombreDe(mia.db, sesion.playerId)} no acepta volver la jugada.`
    );
    return {};
  }

  const jugadas = [...(mia.fila.jugadas ?? [])];
  const deshecha = jugadas.pop();
  await apuntarEnElChat(
    mia.db,
    partidaId,
    "vuelta-aceptada",
    `${await nombreDe(mia.db, sesion.playerId)} acepta volver la jugada${
      deshecha ? ` (${deshecha})` : ""
    }.`
  );
  await guardarYAvisar(mia.db, partidaId, {
    jugadas,
    // El turno vuelve al que la hizo, que es quien la pidió.
    turno: mia.fila.turno === "w" ? "b" : "w",
    ultima_jugada_en: new Date().toISOString(),
    vuelta_pedida_por: null,
    tablas_ofrecidas_por: null,
  });
  return {};
}

/**
 * Dice que no a unas tablas.
 *
 * ES UNA ACCIÓN APARTE, y hace falta: antes el botón de "No" llamaba a
 * `ofrecerTablas`, que alterna — así que rechazar unas tablas las OFRECÍA de vuelta
 * en tu nombre, y el rival podía aceptarlas. Un "no" acababa en tablas. Lo cazó el
 * propietario probando.
 */
export async function rechazarTablas(partidaId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };

  const ofrecidasPor = mia.fila.tablas_ofrecidas_por;
  if (!ofrecidasPor) return { error: "Nadie ha ofrecido tablas." };
  if (ofrecidasPor === sesion.playerId) return { error: "Las has ofrecido tú." };

  await guardarYAvisar(mia.db, partidaId, { tablas_ofrecidas_por: null });
  await apuntarEnElChat(
    mia.db,
    partidaId,
    "tablas-rechazadas",
    `${await nombreDe(mia.db, sesion.playerId)} no acepta las tablas.`
  );
  return {};
}

/**
 * Reclama la victoria por tiempo.
 *
 * Hace falta porque una partida puede acabarse sin que nadie mueva: si el rival se
 * va, no llega ninguna jugada que dispare la comprobación. Reclamar no basta —
 * aquí se mira el reloj de verdad.
 */
export async function reclamarPorTiempo(partidaId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };

  const cerrada = reclamarTiempo(aEstado(mia.fila), Date.now());
  if (!cerrada) return { error: "Al rival todavía le queda tiempo." };

  await guardarYAvisar(mia.db, partidaId, aFila(cerrada));
  if (cerrada.resultado) await cerrarEnElTorneo(mia.db, mia.fila, cerrada.resultado);
  refrescar(partidaId);
  return {};
}

/**
 * Abre (o recupera) la partida en vivo de un emparejamiento de torneo.
 *
 * LOS COLORES SE COPIAN DEL EMPAREJAMIENTO, no se sortean: los repartió el
 * emparejador con el criterio oficial al generar la ronda, y volver a tirarlos aquí
 * rompería el equilibrio de colores de todo el torneo.
 *
 * LA CADENCIA ES DEL TORNEO y no de quien abre la mesa: si la eligiera cada uno,
 * dos mesas de la misma ronda se jugarían a ritmos distintos, y eso no es un torneo.
 */
export async function jugarEmparejamiento(pairingId: string): Promise<Respuesta> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const db = createAdminClient();
  const { data: par } = await db
    .from("club_pairings")
    .select("id, blancas_id, negras_id, resultado, round_id")
    .eq("id", pairingId)
    .maybeSingle();
  if (!par) return { error: "Ese emparejamiento no existe." };
  if (![par.blancas_id, par.negras_id].includes(sesion.playerId)) {
    return { error: "Esa partida no es tuya." };
  }
  if (par.resultado !== null) return { error: "Esa partida ya tiene resultado." };

  // Si ya está abierta, se entra a la que hay. El índice único de la 0023 lo
  // garantiza también en la base, por si llegan dos toques a la vez.
  const { data: existente } = await db
    .from("live_games")
    .select("id")
    .eq("club_pairing_id", pairingId)
    .maybeSingle();
  if (existente) return { id: existente.id };

  const { data: ronda } = await db
    .from("club_rounds")
    .select("club_tournaments(base_min, incremento_s)")
    .eq("id", par.round_id)
    .maybeSingle();
  const torneo = ronda?.club_tournaments as unknown as
    | { base_min: number; incremento_s: number }
    | null;
  const cadencia = {
    baseMs: (torneo?.base_min ?? 10) * 60_000,
    incrementoMs: (torneo?.incremento_s ?? 5) * 1000,
  };
  const reloj = relojInicial(cadencia);

  const { data: creada, error } = await db
    .from("live_games")
    .insert({
      blancas_id: par.blancas_id,
      negras_id: par.negras_id,
      origen: "torneo",
      club_pairing_id: pairingId,
      base_ms: cadencia.baseMs,
      incremento_ms: cadencia.incrementoMs,
      blancas_ms: reloj.blancasMs,
      negras_ms: reloj.negrasMs,
    })
    .select("id")
    .single();
  if (error || !creada) {
    // Choque con el índice único: alguien la acaba de abrir. Se entra a la suya.
    const { data: yaEsta } = await db
      .from("live_games")
      .select("id")
      .eq("club_pairing_id", pairingId)
      .maybeSingle();
    if (yaEsta) return { id: yaEsta.id };
    return { error: "No se ha podido abrir la partida." };
  }
  return { id: creada.id };
}
