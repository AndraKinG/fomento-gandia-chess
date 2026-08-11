"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { actualizarEloActualCore } from "@/lib/import/facv-elo-actual-apply";
import { parseOrdenFuerza } from "@/lib/import/orden-fuerza-parser";
import { sincronizarOrdenFuerzaFACVCore } from "@/lib/import/facv-of-apply";
import { buscarFicha, indicePorNombre } from "@/lib/import/cruzar-nombres";
import { colocarFichaManual, eloOficialDe } from "@/lib/elo/colocar-ficha";

/**
 * Descarga la página pública del orden de fuerza oficial FACV del club y la
 * sincroniza con `force_order` de la temporada activa.
 * Acción de servidor gateada por sesión admin.
 */
export async function sincronizarOrdenFuerzaFACV(): Promise<{
  creados: number;
  actualizados: number;
  avisos?: string[];
  error?: string;
}> {
  if (!(await esAdmin())) {
    return { creados: 0, actualizados: 0, error: "Solo el admin puede hacer esto" };
  }
  const resultado = await sincronizarOrdenFuerzaFACVCore();
  if (!resultado.error) revalidatePath("/club/admin/orden-fuerza");
  return resultado;
}

export async function importarOrdenFuerza(
  seasonNombre: string,
  texto: string
): Promise<{ ok?: string; error?: string }> {
  if (!(await esAdmin())) return { error: "Solo el admin puede importar" };

  // a. Parsear y validar todo antes de tocar la base de datos.
  const { filas, errores } = parseOrdenFuerza(texto);
  if (errores.length > 0)
    return { error: errores.map((e) => `L${e.linea}: ${e.motivo}`).join(" · ") };
  if (filas.length === 0) return { error: "No hay filas que importar" };

  const admin = createAdminClient();

  // b. Resolver/crear todos los jugadores ANTES de tocar seasons/force_order.
  // Si algo falla aquí, no se ha modificado ninguna temporada.
  const resueltos: { playerId: string; numero: number; bisIndex: number }[] = [];
  for (const fila of filas) {
    let playerId: string | null = null;
    if (fila.fideId || fila.fedaId) {
      // El parser garantiza que fideId/fedaId son numéricos (/^\d+$/) antes de
      // llegar aquí, por lo que la interpolación en el filtro .or() es segura
      // frente a inyección de sintaxis PostgREST.
      const or = [
        fila.fideId ? `fide_id.eq.${fila.fideId}` : null,
        fila.fedaId ? `feda_id.eq.${fila.fedaId}` : null,
      ].filter(Boolean).join(",");
      const { data: existing } = await admin
        .from("players").select("id").or(or).maybeSingle();
      playerId = existing?.id ?? null;
    } else {
      // Sin fide_id/feda_id: buscar por nombre exacto para no duplicar el
      // jugador si esta importación es un reintento tras un fallo previo.
      const { data: existing } = await admin
        .from("players").select("id").eq("nombre", fila.nombre).maybeSingle();
      playerId = existing?.id ?? null;
    }
    if (!playerId) {
      const { data: created, error: createErr } = await admin
        .from("players")
        .insert({ nombre: fila.nombre, fide_id: fila.fideId, feda_id: fila.fedaId })
        .select("id").single();
      if (createErr) return { error: `${fila.nombre}: ${createErr.message}` };
      playerId = created.id;
    }
    resueltos.push({
      playerId: playerId as string,
      numero: fila.numero,
      bisIndex: fila.bisIndex,
    });
  }

  // c. Desactivar la temporada activa, crear la nueva e insertar todo el
  // orden de fuerza en una sola llamada. Si el insert masivo falla, se
  // revierte manualmente el alta de la temporada y se restauran las
  // temporadas que estaban activas antes de empezar.
  const { data: previamenteActivas } = await admin
    .from("seasons").select("id").eq("activa", true);

  const { error: deactivateErr } = await admin
    .from("seasons").update({ activa: false }).eq("activa", true);
  if (deactivateErr) return { error: deactivateErr.message };

  const { data: season, error: seasonErr } = await admin
    .from("seasons")
    .insert({ nombre: seasonNombre, activa: true })
    .select("id").single();
  if (seasonErr) return { error: seasonErr.message };

  const { error: orderErr } = await admin.from("force_order").insert(
    resueltos.map((r) => ({
      season_id: season.id,
      player_id: r.playerId,
      numero: r.numero,
      bis_index: r.bisIndex,
    }))
  );
  if (orderErr) {
    await admin.from("seasons").delete().eq("id", season.id);
    const idsPrevios = (previamenteActivas ?? []).map((s) => s.id);
    if (idsPrevios.length > 0) {
      await admin.from("seasons").update({ activa: true }).in("id", idsPrevios);
    }
    return { error: orderErr.message };
  }

  revalidatePath("/club/admin/orden-fuerza");
  return { ok: `Importados ${filas.length} jugadores en "${seasonNombre}"` };
}

/** Número opcional de un formulario: null si viene vacío, NaN si no es un número. */
function enteroOpcional(valor: FormDataEntryValue | null): number | null | undefined {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isInteger(n) && n >= 0 && n <= 3500 ? n : undefined;
}

/**
 * Crea UNA ficha a mano y la coloca en el orden de fuerza de la temporada activa.
 *
 * PARA QUÉ, y por qué es un respaldo y no el camino normal: quien entra al club se
 * autofedera, y en unas semanas la FACV lo publica en el orden de fuerza y la
 * sincronización semanal lo trae solo. Esto es para el hueco de esas semanas: sin ficha
 * no puede vincular su cuenta —la lista de `/vincular` sale del orden de fuerza— así que
 * no tendría acceso a la app hasta que saliera federado.
 *
 * LO IMPORTANTE ES QUE LUEGO SE FUNDA, no que se cree. Cuando la FACV lo publique,
 * `sincronizarOrdenFuerzaFACVCore` tiene que reconocer ESTA ficha y no crear una
 * segunda: lo hace cruzando el nombre por conjunto de palabras, así que da igual si aquí
 * se escribió "Nombre Apellidos" y la FACV lo publica como "Apellidos, Nombre". Si se
 * conoce el ID FIDE, mejor ponerlo: entonces el cruce es por id y no depende del nombre.
 */
export async function crearFichaManual(formData: FormData): Promise<{
  ok?: string;
  error?: string;
}> {
  if (!(await esAdmin())) return { error: "Solo el admin puede hacer esto" };

  const nombre = String(formData.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) return { error: "Escribe el nombre completo del socio" };

  const eloFide = enteroOpcional(formData.get("elo_fide"));
  const eloFeda = enteroOpcional(formData.get("elo_feda"));
  const eloOtro = enteroOpcional(formData.get("elo_otro"));
  if (eloFide === undefined || eloFeda === undefined || eloOtro === undefined) {
    return { error: "Los ELO tienen que ser números enteros entre 0 y 3500" };
  }
  const fideId = String(formData.get("fide_id") ?? "").trim() || null;
  const fedaId = String(formData.get("feda_id") ?? "").trim() || null;

  const admin = createAdminClient();

  const { data: season } = await admin
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();
  if (!season) return { error: "No hay temporada activa: sincroniza antes el orden de fuerza" };

  // Si ya existe una ficha para esa persona no se crea otra: es justo el duplicado que
  // este módulo intenta evitar. Se compara por conjunto de palabras, no por cadena,
  // porque en la base conviven los dos formatos de nombre.
  const { data: todas } = await admin.from("players").select("id, nombre");
  const existente = buscarFicha(
    nombre,
    indicePorNombre((todas ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string })))
  );
  if (existente) {
    return { error: `Ya hay una ficha para ese nombre. Revísala en la lista antes de crear otra.` };
  }

  const elos = { eloFide, eloFeda, eloOtro };

  const { data: creada, error: errorFicha } = await admin
    .from("players")
    .insert({
      nombre,
      elo_fide: eloFide,
      elo_feda: eloFeda,
      elo_otro: eloOtro,
      fide_id: fideId,
      feda_id: fedaId,
    })
    .select("id")
    .single();
  if (errorFicha) return { error: errorFicha.message };

  // Colocación en el orden: por ELO, y en la franja de bis reservada a las manuales
  // para no chocar nunca con una posición que la FACV vaya a ocupar.
  const { data: orden } = await admin
    .from("force_order")
    .select("numero, bis_index, elo_oficial")
    .eq("season_id", season.id);
  const { numero, bisIndex } = colocarFichaManual(
    (orden ?? []).map((f) => ({
      numero: f.numero as number,
      bisIndex: f.bis_index as number,
      eloOficial: f.elo_oficial as number | null,
    })),
    elos
  );

  const { error: errorOrden } = await admin.from("force_order").insert({
    season_id: season.id,
    player_id: creada.id,
    numero,
    bis_index: bisIndex,
    elo_oficial: eloOficialDe(elos),
  });
  if (errorOrden) {
    // La ficha se queda creada aunque falle el orden: borrarla escondería el problema y
    // el admin puede volver a intentarlo. Se dice cuál de las dos cosas ha fallado.
    return {
      error: `Ficha creada, pero no se pudo colocar en el orden de fuerza: ${errorOrden.message}`,
    };
  }

  revalidatePath("/club/admin/orden-fuerza");
  revalidatePath("/club/orden-fuerza");
  // La lista de `/club/vincular` sale del orden de fuerza: sin esto el socio nuevo no
  // se vería a sí mismo para vincularse, que es justo para lo que se crea la ficha.
  revalidatePath("/club/vincular");
  // `bisIndex` es 0 solo cuando el orden estaba vacío: entonces la ficha abre la lista y
  // no es un "bis" de nadie, así que el mensaje no debe decirlo.
  const posicion = bisIndex > 0 ? `${numero}bis` : String(numero);
  return {
    ok:
      `Ficha creada: ${nombre}, colocada como nº ${posicion} por ELO ${eloOficialDe(elos)}. ` +
      `Ya puede vincular su cuenta. Cuando la FACV lo publique, la sincronización la funde con la oficial.`,
  };
}

/**
 * Actualiza el ELO REAL de los socios: el FIDE de clásicas al día, descargado
 * del ranking de la FACV filtrado por el club (facv-elo-actual.ts).
 *
 * SUSTITUYE al antiguo "Actualizar FIDE" que rascaba ratings.fide.com perfil a
 * perfil y solo funcionaba en local: esta fuente es facv.org y funciona también
 * en Vercel — la sync del viernes lo hace sola, este botón es para no esperar.
 */
export async function actualizarEloActual(): Promise<{
  actualizados: number;
  sinCruzar: string[];
  error?: string;
}> {
  if (!(await esAdmin())) {
    return { actualizados: 0, sinCruzar: [], error: "Solo el admin puede hacer esto" };
  }
  return actualizarEloActualCore();
}
