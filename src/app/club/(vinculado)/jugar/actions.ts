"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionVerificada } from "@/lib/auth/sesion";
import {
  aplicarJugada,
  finPorAbandono,
  reclamarTiempo,
  volverJugada,
  type Jugada,
} from "@/lib/vivo/partida";
import { parado, relojInicial } from "@/lib/vivo/reloj";
import { blancasEnAmistosa } from "@/lib/vivo/colores";
import { avisar } from "@/lib/avisos/enviar";
import { difundirAviso } from "@/lib/vivo/difundir";
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

/**
 * Refresca las pantallas de servidor.
 *
 * NO SE LLAMA AL MOVER, y es deliberado: `revalidatePath` obliga a Next a rehacer la
 * página entera en el servidor, y hacerlo en cada jugada añadía cientos de
 * milisegundos a cada movimiento de una partida a 3+2. La mesa se entera por tiempo
 * real, que para eso está. Solo se refresca cuando la partida CAMBIA DE ESTADO
 * —empieza o termina—, que es lo que ven las listas.
 */
function refrescar(id: string): void {
  revalidatePath("/club/jugar");
  revalidatePath(`/club/jugar/${id}`);
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
  const sesion = await sesionVerificada();
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

  // UN SOLO RETO PENDIENTE POR PERSONA. Sin esto, cada toque del botón crea otro: la
  // noche del lanzamiento un socio retó al mismo rival dos veces y al otro le
  // aparecieron dos retos idénticos, sin forma de saber si eran dos partidas o un
  // dedazo. Y no es raro — el botón no da acuse de recibo inmediato, así que volver a
  // pulsarlo es la reacción natural de quien cree que no ha ido.
  //
  // SE BLOQUEA CUALQUIER SEGUNDO RETO, no solo el de la misma cadencia: dos retos a la
  // vez a la misma persona no sirven para nada, y comparando cadencias un 5+3 y un 5+0
  // pasarían por distintos cuando en la práctica son el mismo "¿jugamos?".
  const { data: yaPendiente } = await db
    .from("challenges")
    .select("id")
    .eq("reta_id", sesion.playerId)
    .eq("retado_id", datos.aQuien)
    .eq("estado", "pendiente")
    .maybeSingle();
  if (yaPendiente) {
    return { error: "Ya le has retado. Espera a que conteste." };
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
  const sesion = await sesionVerificada();
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
      await avisar([quienReta.id], {
        tipo: "reto_aceptado",
        titulo: "Te han aceptado el reto",
        cuerpo: `${yo?.nombre ?? "Tu rival"} te espera en el tablero.`,
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
  const sesion = await sesionVerificada();
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
  const sesion = await sesionVerificada();
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
      // ESTE TAMBIÉN ES UN FINAL, y faltaba (revisión del 2026-11-10): en una partida de
      // torneo, perder por tiempo al mover tarde dejaba el emparejamiento SIN RESULTADO,
      // y el cierre de abandonadas no lo rescata porque la partida ya está cerrada.
      if (r.estado.resultado) await cerrarEnElTorneo(mia.db, mia.fila, r.estado.resultado);
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
  const sesion = await sesionVerificada();
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
  const sesion = await sesionVerificada();
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
  const sesion = await sesionVerificada();
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
  const sesion = await sesionVerificada();
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
 * LA BANDERA SE MIRA ANTES QUE LA RESPUESTA, se acepte o no: quien responde es quien
 * tiene el turno, y si se le ha acabado el tiempo la partida ya estaba perdida. Antes,
 * aceptar le devolvía el turno al rival y la derrota desaparecía (revisión del
 * 2026-11-10). Ahora se cierra por tiempo, como al mover tarde.
 *
 * QUÉ PASA CON EL RELOJ al aceptar: se DESCUENTA lo que pensó quien acepta y entonces
 * se pasa el turno (`volverJugada`). El que pensó esos segundos los pensó, y
 * devolvérselos abriría la puerta a ganar tiempo pidiendo volver jugadas — que es lo
 * que pasaba: el código reiniciaba la marca del reloj sin descontar nada.
 */
export async function responderVolverJugada(
  partidaId: string,
  acepta: boolean
): Promise<Respuesta> {
  const sesion = await sesionVerificada();
  if (!sesion?.playerId) return { error: "No autorizado" };

  const mia = await miPartida(partidaId, sesion.playerId);
  if (!mia?.color) return { error: "Esa partida no es tuya." };
  if (mia.fila.resultado) return { error: "Esa partida ya ha terminado." };

  const quienPidio = mia.fila.vuelta_pedida_por;
  if (!quienPidio) return { error: "Nadie ha pedido volver ninguna jugada." };
  if (quienPidio === sesion.playerId) return { error: "La has pedido tú." };

  const porTiempo = reclamarTiempo(aEstado(mia.fila), Date.now());
  if (porTiempo?.resultado) {
    const sinTiempo = mia.fila.turno === "w" ? mia.fila.blancas_id : mia.fila.negras_id;
    await apuntarEnElChat(
      mia.db,
      partidaId,
      "tiempo",
      `Se acabó el tiempo de ${await nombreDe(mia.db, sinTiempo)} antes de responder a la petición.`
    );
    await guardarYAvisar(mia.db, partidaId, aFila(porTiempo));
    await cerrarEnElTorneo(mia.db, mia.fila, porTiempo.resultado);
    refrescar(partidaId);
    return { error: "Se acabó el tiempo: la partida ha terminado." };
  }

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

  const vuelta = volverJugada(aEstado(mia.fila), Date.now());
  if (!vuelta) return { error: "No hay ninguna jugada que volver." };
  const deshecha = (mia.fila.jugadas ?? []).at(-1);
  await apuntarEnElChat(
    mia.db,
    partidaId,
    "vuelta-aceptada",
    `${await nombreDe(mia.db, sesion.playerId)} acepta volver la jugada${
      deshecha ? ` (${deshecha})` : ""
    }.`
  );
  // `aFila` lo escribe TODO —también los dos relojes, que es lo que faltaba— y de paso
  // limpia la petición y cualquier oferta de tablas viva.
  await guardarYAvisar(mia.db, partidaId, aFila(vuelta));
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
  const sesion = await sesionVerificada();
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
  const sesion = await sesionVerificada();
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
  const sesion = await sesionVerificada();
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
