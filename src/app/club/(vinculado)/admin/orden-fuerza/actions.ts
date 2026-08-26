"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin, esJunta } from "@/lib/auth/es-admin";
import { actualizarEloActualCore } from "@/lib/import/facv-elo-actual-apply";
import { parseOrdenFuerza } from "@/lib/import/orden-fuerza-parser";
import { sincronizarOrdenFuerzaFACVCore } from "@/lib/import/facv-of-apply";
import { buscarFicha, indicePorNombre } from "@/lib/import/cruzar-nombres";
import { colocarFichaManual, eloOficialDe } from "@/lib/elo/colocar-ficha";
import { moteOcupado, textoOcupado, validarMote } from "@/lib/club/mote";
import { avisar } from "@/lib/avisos/enviar";

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
  // JUNTA Y ADMIN desde el 2026-08-26: dar de alta a quien acaba de entrar al club es
  // trabajo de la junta, y dejarlo solo en manos del admin significaba que un socio
  // nuevo no podía vincular su cuenta hasta que él tuviera un rato. La pantalla de
  // /club/admin no la ve la junta, así que el formulario vive además en
  // /club/solicitudes, que es su sitio.
  if (!(await esJunta())) return { error: "No autorizado" };

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
  // AL ORDEN DE FUERZA, SOLO SI TOCA (decisión del propietario, 2026-08-26). El orden de
  // fuerza es el documento que publica la FACV al empezar la temporada: quien entra al
  // club con el plazo abierto SÍ va dentro, con su número "bis", porque puede jugar el
  // Interclubs. Quien llega después NO — meterlo ahí sería reescribir un papel que ya
  // decidió los tableros de las convocatorias hechas. Su ficha existe igual y sale en
  // /club/socios, que es la lista de la gente.
  const alOrden = formData.get("al_orden") === "on";

  const admin = createAdminClient();

  const { data: season } = await admin
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();
  if (!season) return { error: "No hay temporada activa: sincroniza antes el orden de fuerza" };

  // Si ya existe una ficha para esa persona no se crea otra: es justo el duplicado que
  // este módulo intenta evitar. Se compara por conjunto de palabras, no por cadena,
  // porque en la base conviven los dos formatos de nombre.
  const { data: todas } = await admin.from("players").select("id, nombre, activo");
  const existente = buscarFicha(
    nombre,
    indicePorNombre((todas ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string })))
  );
  if (existente) {
    // SI VUELVE ALGUIEN QUE SE DIO DE BAJA, SE RESCATA SU FICHA en vez de crear otra
    // (lo pidió el propietario el 2026-08-26: "que se pueda rescatar y actualizar sus
    // datos"). Es lo que hace que dar de baja no sea una vía muerta: quien vuelve
    // recupera sus partidas, su historial y su ELO en lugar de empezar de cero con una
    // ficha nueva que además dejaría dos personas donde hay una.
    const fila = (todas ?? []).find((p) => p.id === existente);
    if (fila && fila.activo === false) {
      const { error: errorAlta } = await admin
        .from("players")
        .update({
          activo: true,
          // Se aprovecha para actualizar lo que se haya escrito, pero SOLO lo que venga
          // relleno: un campo vacío en el formulario no es "bórralo".
          ...(eloFide !== null ? { elo_fide: eloFide } : {}),
          ...(eloFeda !== null ? { elo_feda: eloFeda } : {}),
          ...(eloOtro !== null ? { elo_otro: eloOtro } : {}),
          ...(fideId ? { fide_id: fideId } : {}),
          ...(fedaId ? { feda_id: fedaId } : {}),
        })
        .eq("id", existente);
      if (errorAlta) return { error: "No se pudo reactivar la ficha." };
      revalidatePath("/club/socios");
      revalidatePath(`/club/socios/${existente}`);
      revalidatePath("/club/orden-fuerza");
      revalidatePath("/club/vincular");
      return {
        ok: `${nombre} ya tenía ficha y estaba de baja: se ha reactivado con sus partidas y su historial.`,
      };
    }
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

  if (!alOrden) {
    revalidatePath("/club/socios");
    revalidatePath("/club/vincular");
    return {
      ok:
        `Ficha creada: ${nombre}. Ya sale en los socios del club y puede vincular su cuenta. ` +
        `NO se ha metido en el orden de fuerza del Interclubs; cuando la FACV lo publique, la sincronización lo colocará.`,
    };
  }

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
  revalidatePath("/club/socios");
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

/**
 * Pone o quita el mote del club de un socio (migración 0041).
 *
 * DE AQUÍ SALE EL NOMBRE QUE VE TODO EL CLUB: `nombreVisible()` enseña el mote en
 * lugar del nombre en todas las pantallas de socios. Lo que NO se toca nunca es
 * `players.nombre`, que es el nombre oficial de la FACV y la clave con la que se
 * cruzan las 248 filas de acta — escribir el mote ahí dejaría a ese socio sin cruzar
 * en la siguiente sincronización y sin decir nada.
 *
 * Junta y admin, que es quien conoce a los 46 y puede rellenarlos de una sentada. Con
 * 43 socios sin cuenta todavía, dejarlo en manos de cada uno significaría no verlos
 * durante meses.
 */
/**
 * El ELO ESTIMADO de un socio (`players.elo_otro`), a mano.
 *
 * DE LOS TRES ELOS ES EL ÚNICO QUE SE PUEDE TOCAR A MANO, y conviene tener claro por
 * qué (regla de los tres ELOs en CLAUDE.md):
 *
 * - `elo_fide` lo trae la sincronización del viernes desde el ranking de la FACV, así
 *   que escribirlo aquí duraría hasta el viernes y se perdería SIN AVISAR. Si está mal,
 *   está mal en la FACV.
 * - `force_order.elo_oficial` es el documento estático del orden de fuerza, que también
 *   se sincroniza, y encima solo vale para el Interclubs.
 * - `elo_otro` no lo escribe nadie más, y es el respaldo del artículo 52.1 del RGC: lo
 *   usa `fuerza()` cuando un socio no tiene FIDE ni FEDA, que es justo el caso del que
 *   acaba de entrar al club y todavía no sale federado.
 *
 * O SEA QUE ESTO ES PARA QUIEN NO TIENE ELO OFICIAL. Con ELO de la FACV, el número que
 * manda sigue siendo aquel, y este se guarda pero no se enseña.
 *
 * Junta y admin, como el mote: es la gente que conoce a los 46.
 */
export async function ponerEloEstimado(
  playerId: string,
  valor: string
): Promise<{ error?: string }> {
  if (!(await esJunta())) return { error: "No autorizado" };

  // Vacío = quitarlo. Mismo criterio y mismos topes que al crear una ficha a mano
  // (`enteroOpcional`), para que el número válido sea el mismo por las dos puertas.
  const elo = enteroOpcional(valor);
  if (elo === undefined) return { error: "Un ELO entre 0 y 3500." };

  const { error } = await createAdminClient()
    .from("players")
    .update({ elo_otro: elo })
    .eq("id", playerId);
  if (error) return { error: "No se pudo guardar el ELO." };

  // Las dos pantallas donde se ve, y las convocatorias, que lo usan para la fuerza.
  revalidatePath("/club/admin/orden-fuerza");
  revalidatePath(`/club/socios/${playerId}`);
  revalidatePath("/club/orden-fuerza");
  return {};
}

/**
 * Da de baja a un socio, o lo reactiva.
 *
 * NO SE BORRA LA FICHA, Y ESTO ES LA DECISIÓN DEL ASUNTO. `games.player_id` está con
 * `on delete cascade` (migración 0014), así que borrar a alguien se llevaría por delante
 * TODAS sus partidas del repositorio, y con ellas los ELOs del club que se recalculan de
 * esas partidas; también sus filas de actas y clasificaciones. Alguien que se va del
 * club es historia del club, no una equivocación que haya que hacer desaparecer.
 *
 * QUÉ HACE UNA BAJA, que es lo que hay que saber para explicarlo: la ficha deja de
 * ofrecerse donde se juega o se organiza —lista de retos, inscripción a torneos internos,
 * selector de rival de una partida, plantillas de equipo, panel de uso y registro de
 * cuentas nuevas— y sus partidas y resultados se quedan donde están.
 *
 * DÓNDE SIGUE APARECIENDO, y a propósito: en `/club/orden-fuerza`. Esa lista es el
 * documento que publica la FACV, y no se puede reescribir hasta que ellos publiquen otro;
 * lo que se hace es marcarlo como "baja" para que nadie lo confunda con un socio activo.
 *
 * Junta y admin, como el resto de la gestión de socios.
 */
export async function cambiarActivoSocio(
  playerId: string,
  activo: boolean
): Promise<{ error?: string }> {
  if (!(await esJunta())) return { error: "No autorizado" };

  const { error } = await createAdminClient()
    .from("players")
    .update({ activo })
    .eq("id", playerId);
  if (error) return { error: "No se pudo cambiar el estado del socio." };

  // La baja se nota en media app, así que se rehacen las pantallas que ofrecen fichas.
  revalidatePath(`/club/socios/${playerId}`);
  revalidatePath("/club/orden-fuerza");
  revalidatePath("/club/admin/orden-fuerza");
  revalidatePath("/club/jugar");
  revalidatePath("/club/equipos");
  revalidatePath("/club");
  return {};
}

export async function ponerApodo(
  playerId: string,
  apodo: string
): Promise<{ error?: string }> {
  if (!(await esJunta())) return { error: "No autorizado" };

  // EL FORMATO LO DECIDE UN SOLO SITIO, `validarMote`, porque desde el 2026-08-13 hay
  // dos puertas: esta y la solicitud del socio desde su perfil. Validar por separado
  // acabaría con el socio pidiendo un mote que al aprobarse da error.
  const revisado = validarMote(apodo);
  if (!revisado.ok) return { error: revisado.error };
  // Vacío = quitar el mote. Es null y no "", que la base rechaza la cadena vacía a
  // propósito (si no, la app enseñaría un hueco donde va un nombre).
  const valor = revisado.valor || null;

  const admin = createAdminClient();

  // DOS SOCIOS NO PUEDEN TENER EL MISMO MOTE (pedido del propietario el 2026-08-13,
  // poniéndolos): un mote existe para reconocer a alguien de un vistazo, y dos "Ximo"
  // en la lista de retos son peores que el nombre oficial, que al menos era distinto.
  //
  // Se comprueba aquí ADEMÁS del índice único de la 0042 para poder decir DE QUIÉN es
  // el mote. El índice contestaría con un error de Postgres ilegible, y su trabajo es
  // otro: que la regla siga siendo verdad si algún día se escribe desde otro sitio.
  if (valor) {
    const ocupado = await quienTieneElMote(admin, valor, playerId);
    if (ocupado) return { error: textoOcupado(ocupado) };
  }

  const { error } = await admin.from("players").update({ apodo: valor }).eq("id", playerId);
  if (error) {
    // Red de seguridad del índice: si dos personas guardan el mismo mote a la vez, la
    // comprobación de arriba puede pasar en las dos y la base rechaza la segunda.
    if (error.code === "23505") return { error: "Ese mote ya lo tiene otro socio." };
    return { error: error.message };
  }

  // El mote sale en media app, así que se rehacen las pantallas que lo enseñan de
  // listas enteras. Las demás lo cogerán en su siguiente pintado.
  revalidatePath("/club/admin/orden-fuerza");
  revalidatePath("/club/orden-fuerza");
  revalidatePath(`/club/socios/${playerId}`);
  revalidatePath("/club/jugar");
  revalidatePath("/club/partidas");
  revalidatePath("/club");
  return {};
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type ClienteAdmin = ReturnType<typeof createAdminClient>;

/**
 * ¿Tiene ya alguien este mote, puesto o pedido?
 *
 * Se traen las 46 filas y se decide con `moteOcupado()` (puro, con tests) en vez de
 * montar el filtro en la consulta: la regla cruza DOS columnas —`apodo` y
 * `apodo_solicitado`— y expresarla en PostgREST daría un `or()` ilegible para ahorrar
 * una lectura de 46 filas de tres columnas, que a escala de club no se nota.
 */
async function quienTieneElMote(
  admin: ClienteAdmin,
  mote: string,
  exceptoFicha: string
): Promise<{ nombre: string; pedido: boolean } | null> {
  const { data } = await admin
    .from("players")
    .select("id, nombre, apodo, apodo_solicitado")
    .neq("id", exceptoFicha);
  return moteOcupado(
    mote,
    ((data ?? []) as any[]).map((p) => ({
      nombre: p.nombre as string,
      apodo: p.apodo as string | null,
      apodoSolicitado: p.apodo_solicitado as string | null,
    }))
  );
}

/**
 * Aprueba o rechaza el mote que ha pedido un socio (migración 0043).
 *
 * SE VUELVE A COMPROBAR QUE ESTÉ LIBRE al aprobar, aunque ya se comprobara al pedirlo:
 * entre una cosa y otra pueden pasar días, y en ese hueco la junta puede haberle puesto
 * ese mismo mote a otro a mano. Aprobar a ciegas dejaría el error para el índice de la
 * 0042, que contesta en jerga de Postgres.
 *
 * SE AVISA AL SOCIO EN LOS DOS CASOS. Un rechazo sin explicación es peor que no poder
 * pedirlo: la solicitud desaparecería de su perfil sin que nadie le diga nada.
 */
export async function resolverMote(
  playerId: string,
  aprobar: boolean
): Promise<{ error?: string }> {
  if (!(await esJunta())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: ficha } = await admin
    .from("players")
    .select("id, nombre, apodo, apodo_solicitado")
    .eq("id", playerId)
    .maybeSingle();
  if (!ficha) return { error: "Esa ficha no existe." };

  const pedido = (ficha.apodo_solicitado as string | null)?.trim();
  if (!pedido) return { error: "Ese socio no tiene ningún mote pendiente." };

  if (aprobar) {
    const ocupado = await quienTieneElMote(admin, pedido, playerId);
    if (ocupado) {
      return {
        error: `${textoOcupado(ocupado)} Rechaza este y que pida otro.`,
      };
    }
  }

  const { error } = await admin
    .from("players")
    .update({
      apodo: aprobar ? pedido : (ficha.apodo as string | null),
      apodo_solicitado: null,
    })
    .eq("id", playerId);
  if (error) {
    if (error.code === "23505") return { error: "Ese mote ya lo tiene otro socio." };
    return { error: error.message };
  }

  // Al socio, por su cuenta. Si no se ha registrado todavía no hay a quién avisar, y no
  // es un fallo: alguien le habrá puesto el mote por él.
  const { data: cuenta } = await admin
    .from("profiles")
    .select("id")
    .eq("player_id", playerId)
    .maybeSingle();
  if (cuenta) {
    await avisar([cuenta.id as string], {
      tipo: "mote_resuelto",
      titulo: aprobar ? `Ya eres ${pedido}` : "Tu mote no se ha aprobado",
      cuerpo: aprobar
        ? `La junta ha aprobado tu mote. En el club te verán como ${pedido}.`
        : `El mote "${pedido}" no se ha aprobado. Puedes pedir otro desde tu perfil.`,
      url: "/club/perfil",
    });
  }

  revalidatePath("/club/admin/orden-fuerza");
  revalidatePath("/club/orden-fuerza");
  revalidatePath(`/club/socios/${playerId}`);
  revalidatePath("/club/perfil");
  revalidatePath("/club/jugar");
  revalidatePath("/club");
  return {};
}
