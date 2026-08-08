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
import { relojInicial } from "@/lib/vivo/reloj";

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
    ultima_jugada_en:
      e.reloj.ultimaJugadaEn === null ? null : new Date(e.reloj.ultimaJugadaEn).toISOString(),
    resultado: e.resultado,
    motivo: e.motivo,
    terminada_en: e.resultado ? new Date().toISOString() : null,
    // Cualquier jugada mata una oferta de tablas viva: aceptar unas tablas que se
    // ofrecieron hace cinco jugadas no es lo que nadie espera.
    tablas_ofrecidas_por: null,
  };
}

function refrescar(id: string): void {
  revalidatePath("/club/jugar");
  revalidatePath(`/club/jugar/${id}`);
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

  revalidatePath("/club/jugar");
  return { id: data.id };
}

/**
 * Acepta un reto y crea la partida.
 *
 * AQUÍ SE REPARTEN LOS COLORES, en el servidor: si el azar lo tirara el navegador,
 * el que reta elegiría color siempre.
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

  const quiere = reto.color as "blancas" | "negras" | "azar";
  const retaConBlancas = quiere === "azar" ? Math.random() < 0.5 : quiere === "blancas";
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

  await db
    .from("challenges")
    .update({ estado: reto.reta_id === sesion.playerId ? "cancelado" : "rechazado" })
    .eq("id", retoId);
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
      await mia.db.from("live_games").update(aFila(r.estado)).eq("id", partidaId);
      refrescar(partidaId);
    }
    return { error: r.error };
  }

  await mia.db.from("live_games").update(aFila(r.estado)).eq("id", partidaId);
  refrescar(partidaId);
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
  await mia.db
    .from("live_games")
    .update({
      resultado: fin.resultado,
      motivo: fin.motivo,
      terminada_en: new Date().toISOString(),
      tablas_ofrecidas_por: null,
    })
    .eq("id", partidaId);
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
  await mia.db
    .from("live_games")
    .update({ tablas_ofrecidas_por: yaLasOfreci ? null : sesion.playerId })
    .eq("id", partidaId);
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

  await mia.db
    .from("live_games")
    .update({
      resultado: "1/2-1/2",
      motivo: "tablas-acordadas",
      terminada_en: new Date().toISOString(),
      tablas_ofrecidas_por: null,
    })
    .eq("id", partidaId);
  refrescar(partidaId);
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

  await mia.db.from("live_games").update(aFila(cerrada)).eq("id", partidaId);
  refrescar(partidaId);
  return {};
}
