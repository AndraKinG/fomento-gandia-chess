"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/avisos/enviar";
import { esJunta } from "@/lib/auth/es-admin";
import { sesionActual } from "@/lib/auth/sesion";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import {
  efectosDeApuntarse,
  efectosDeBajarse,
  efectosDeBorrarCoche,
  efectosDeCambiarAsistencia,
  puedeApuntarse,
  puedeCambiarAsistencia,
  puedeCambiarPlazas,
  type Asistencia,
  type Aviso,
  type Cambio,
  type Estado,
  type MotivoRechazo,
} from "@/lib/torneos/coches";

type Resultado = { error?: string };

const ASISTENCIAS: Asistencia[] = ["voy", "no_voy", "duda"];

/**
 * Mensajes de los rechazos del módulo de reglas. Viven aquí y no en el módulo
 * puro porque el módulo no debe saber nada de cómo se le habla al usuario.
 */
const MENSAJE_RECHAZO: Record<MotivoRechazo, string> = {
  coche_lleno: "Ese coche ya está completo.",
  ya_va_en_otro_coche: "Ya tienes plaza en otro coche de este torneo.",
  es_el_conductor_de_este: "Es tu coche: el conductor no ocupa plaza de pasajero.",
  es_conductor_de_otro: "Ya llevas coche a este torneo.",
  coche_inexistente: "Ese coche ya no existe.",
};

/** Ficha del usuario de la sesión, o null si no tiene ninguna vinculada. */
async function miFicha(): Promise<{ playerId: string } | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("player_id")
    .eq("id", user.id)
    .single();
  return profile?.player_id ? { playerId: profile.player_id } : null;
}

/**
 * Estado completo de coches y asistencias de un torneo, tal como lo espera el
 * módulo de reglas. Se lee con el cliente de usuario: la RLS ya deja que
 * cualquier socio vinculado lo vea (es un viaje en grupo).
 */
async function leerEstado(tournamentId: string): Promise<Estado> {
  const supabase = await createServerSupabase();
  const [{ data: coches }, { data: asientos }, { data: asistencias }] = await Promise.all([
    supabase
      .from("cars")
      .select("id, conductor_id, plazas, hora_salida, punto_salida")
      .eq("tournament_id", tournamentId),
    supabase.from("car_seats").select("car_id, player_id").eq("tournament_id", tournamentId),
    supabase
      .from("tournament_attendance")
      .select("player_id, estado")
      .eq("tournament_id", tournamentId),
  ]);

  return {
    coches: (coches ?? []).map((c) => ({
      id: c.id,
      conductorId: c.conductor_id,
      plazas: c.plazas,
      horaSalida: c.hora_salida,
      puntoSalida: c.punto_salida,
    })),
    asientos: (asientos ?? []).map((a) => ({ cocheId: a.car_id, playerId: a.player_id })),
    asistencias: Object.fromEntries(
      (asistencias ?? []).map((a) => [a.player_id, a.estado as Asistencia])
    ),
  };
}

/**
 * Aplica la lista de cambios que devuelve el módulo de reglas.
 *
 * Con el cliente de usuario a propósito, para que la RLS siga siendo la barrera:
 * un socio solo puede escribir su propia asistencia y su propio asiento, y solo
 * el conductor puede borrar su coche. Si una acción intentara algo que no le
 * toca, la base de datos lo rechaza aunque la lógica de aquí se equivoque.
 */
async function aplicar(cambios: Cambio[], tournamentId: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const ahora = new Date().toISOString();

  for (const c of cambios) {
    if (c.tipo === "asistencia") {
      const { error } = await supabase.from("tournament_attendance").upsert(
        { tournament_id: tournamentId, player_id: c.playerId, estado: c.estado, updated_at: ahora },
        { onConflict: "tournament_id,player_id" }
      );
      if (error) return error.message;
    } else if (c.tipo === "ocupar_plaza") {
      const { error } = await supabase
        .from("car_seats")
        .insert({ car_id: c.cocheId, player_id: c.playerId });
      // El trigger de la migración 0010 puede rechazarlo si otra persona ha
      // cogido la plaza entre la comprobación y esta escritura. Su mensaje ya es
      // legible, así que se devuelve tal cual.
      if (error) return error.message;
    } else if (c.tipo === "liberar_plaza") {
      const { error } = await supabase
        .from("car_seats")
        .delete()
        .eq("car_id", c.cocheId)
        .eq("player_id", c.playerId);
      if (error) return error.message;
    } else if (c.tipo === "borrar_coche") {
      const { error } = await supabase.from("cars").delete().eq("id", c.cocheId);
      if (error) return error.message;
    }
  }
  return null;
}

/**
 * Manda los avisos de coches que devuelve el módulo de reglas: a quien pierde
 * su plaza (porque otro se ha bajado) o a quien se queda sin coche (porque el
 * conductor lo ha borrado). El nombre distingue esta función de `avisar()`
 * (`@/lib/avisos/enviar`), que es la que de verdad guarda y envía.
 *
 * Cliente de servicio porque hay que traducir fichas a cuentas de usuario, y la
 * RLS de `profiles` no deja a un socio leer la de otro — con razón.
 *
 * **Nunca puede hacer fallar la operación que lo dispara**: la plaza ya está
 * liberada aunque el push no salga, igual que en el aviso de vinculación.
 */
async function avisarDeCoches(avisos: Aviso[], nombreTorneo: string): Promise<void> {
  if (avisos.length === 0) return;
  try {
    const admin = createAdminClient();
    const fichas = [...new Set(avisos.map((a) => a.destinatarioId))];
    const [{ data: perfiles }, { data: jugadores }] = await Promise.all([
      admin.from("profiles").select("id, player_id").in("player_id", fichas),
      admin.from("players").select("id, nombre"),
    ]);
    const cuentaPorFicha = new Map((perfiles ?? []).map((p) => [p.player_id, p.id]));
    const nombrePorFicha = new Map((jugadores ?? []).map((j) => [j.id, j.nombre]));

    for (const aviso of avisos) {
      const cuenta = cuentaPorFicha.get(aviso.destinatarioId);
      // Sin cuenta vinculada no hay a quién avisar: hay socios que no usan la app.
      if (!cuenta) continue;

      // El tipo va SIEMPRE en la misma rama que el texto: así no pueden
      // desparejarse (un cuerpo de "sin coche" guardado con el tipo de
      // "plaza liberada", por ejemplo).
      const payload =
        aviso.tipo === "plaza_liberada"
          ? {
              tipo: "coche_plaza_libre" as const,
              titulo: "Se ha liberado una plaza",
              cuerpo: `${nombrePorFicha.get(aviso.pasajeroId) ?? "Un socio"} ya no va a ${nombreTorneo}.`,
              url: "/club/torneos/facv",
            }
          : {
              tipo: "coche_sin_plaza" as const,
              titulo: "Te has quedado sin coche",
              cuerpo: `El coche al que ibas a ${nombreTorneo} ya no está disponible.`,
              url: "/club/torneos/facv",
            };
      await avisar([cuenta], payload);
    }
  } catch {
    // Silencio a propósito: ver comentario de arriba.
  }
}

/**
 * Avisa al club de que **alguien ha abierto plan** para un torneo.
 *
 * Un torneo del calendario de la FACV es invisible hasta que el primer socio dice
 * que va; ese momento es el que interesa contar, porque es cuando el resto puede
 * sumarse y organizar los coches. Del segundo en adelante no se avisa: sería
 * ruido y la gente silenciaría las notificaciones.
 *
 * Nunca hace fallar la operación: la asistencia ya está guardada aunque el push
 * no salga.
 */
async function avisarPrimerApuntado(
  tournamentId: string,
  quienId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: asistencias }, { data: torneo }] = await Promise.all([
      admin
        .from("tournament_attendance")
        .select("player_id, estado")
        .eq("tournament_id", tournamentId)
        .in("estado", ["voy", "duda"]),
      admin
        .from("tournaments")
        .select("nombre, fecha_inicio, fecha_fin, lugar, de_interes")
        .eq("id", tournamentId)
        .single(),
    ]);

    // Solo si es el primero, y solo si el torneo no estaba ya en la lista del
    // club por decisión del admin (en ese caso ya se avisó al marcarlo).
    const otros = (asistencias ?? []).filter((a) => a.player_id !== quienId);
    if (otros.length > 0 || !torneo || torneo.de_interes) return;

    const { data: yo } = await admin
      .from("players")
      .select("nombre")
      .eq("id", quienId)
      .single();

    const { data: perfiles } = await admin
      .from("profiles")
      .select("id")
      .not("player_id", "is", null)
      .neq("player_id", quienId);
    const ids = (perfiles ?? []).map((p) => p.id);
    if (ids.length === 0) return;

    await avisar(ids, {
      tipo: "torneo_primer_apuntado",
      titulo: `${yo?.nombre ?? "Un socio"} va a un torneo`,
      cuerpo: `${torneo.nombre}, ${formatearRangoFechas(torneo.fecha_inicio, torneo.fecha_fin)}${torneo.lugar ? ` en ${torneo.lugar}` : ""}. ¿Te apuntas?`,
      url: `/club/torneos/facv/${tournamentId}`,
    });
  } catch {
    // Silencio a propósito: ver comentario de arriba.
  }
}

async function nombreTorneo(tournamentId: string): Promise<string> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tournaments")
    .select("nombre")
    .eq("id", tournamentId)
    .single();
  return data?.nombre ?? "el torneo";
}

function refrescar(tournamentId: string): void {
  revalidatePath("/club/torneos/facv");
  revalidatePath(`/club/torneos/facv/${tournamentId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * "¿Vas a este torneo?". Pasar a `no_voy` libera la plaza de coche que tuviera y
 * avisa al conductor (regla 3 de la spec).
 */
export async function marcarAsistencia(
  tournamentId: string,
  estado: Asistencia
): Promise<Resultado> {
  if (!ASISTENCIAS.includes(estado)) return { error: "Estado no válido" };
  const yo = await miFicha();
  if (!yo) return { error: "No tienes una ficha vinculada" };

  const estadoTorneo = await leerEstado(tournamentId);

  // Un conductor con pasajeros no puede escurrirse diciendo que no va: tiene que
  // borrar su coche a propósito, para que sus pasajeros se enteren.
  const permiso = puedeCambiarAsistencia(yo.playerId, estado, estadoTorneo);
  if (!permiso.puede) {
    return {
      error: `Llevas ${permiso.pasajeros} ${permiso.pasajeros === 1 ? "pasajero" : "pasajeros"} en tu coche. Bórralo primero para que puedan buscar sitio en otro.`,
    };
  }

  const { cambios, avisos } = efectosDeCambiarAsistencia(yo.playerId, estado, estadoTorneo);

  const error = await aplicar(cambios, tournamentId);
  if (error) return { error };

  await avisarDeCoches(avisos, await nombreTorneo(tournamentId));
  // Si acaba de abrir plan donde no había nadie, se lo cuenta al club.
  if (estado === "voy" || estado === "duda") {
    await avisarPrimerApuntado(tournamentId, yo.playerId);
  }
  // LA PORTADA TAMBIÉN SE REHACE, y por eso está aquí: desde el 2026-08-13 enseña los
  // torneos con gente apuntada, así que decir "voy" cambia lo que ve todo el club, no
  // solo esta pantalla.
  //
  // NO se escribe ninguna marca `de_interes` al apuntarse, y hubo un intento fallido
  // de hacerlo ese mismo día: la lista de Torneos ya calcula "esto interesa" de las
  // asistencias justamente para que no se quede encendido cuando el último se baja
  // (ver la cabecera de `torneos/facv/page.tsx`). Escribir la marca resucitaba ese
  // problema y, con la portada contando gente, no aportaba nada.
  revalidatePath("/club");
  refrescar(tournamentId);
  return {};
}

/**
 * Ofrecer coche. Exige ir al torneo (`voy` o `duda`): ofrecer coche a un torneo
 * al que no vas no tiene sentido, y es una decisión expresa del propietario.
 */
export async function ofrecerCoche(
  tournamentId: string,
  datos: { plazas: number; horaSalida?: string; puntoSalida?: string; notas?: string }
): Promise<Resultado> {
  const yo = await miFicha();
  if (!yo) return { error: "No tienes una ficha vinculada" };
  if (!Number.isInteger(datos.plazas) || datos.plazas < 1) {
    return { error: "Di cuántas plazas ofreces (al menos 1)." };
  }

  const estado = await leerEstado(tournamentId);
  const miAsistencia = estado.asistencias[yo.playerId];
  if (miAsistencia !== "voy" && miAsistencia !== "duda") {
    return { error: "Primero di que vas al torneo y luego ofrece tu coche." };
  }
  if (estado.coches.some((c) => c.conductorId === yo.playerId)) {
    return { error: "Ya has ofrecido un coche para este torneo." };
  }
  // Un pasajero no puede además conducir: tendría que bajarse primero.
  if (estado.asientos.some((a) => a.playerId === yo.playerId)) {
    return { error: "Bájate del coche en el que vas antes de ofrecer el tuyo." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("cars").insert({
    tournament_id: tournamentId,
    conductor_id: yo.playerId,
    plazas: datos.plazas,
    hora_salida: datos.horaSalida?.trim() || null,
    punto_salida: datos.puntoSalida?.trim() || null,
    notas: datos.notas?.trim() || null,
  });
  if (error) return { error: error.message };

  refrescar(tournamentId);
  return {};
}

/** Coger plaza en un coche. Implica decir que vas al torneo (regla 2). */
export async function apuntarseACoche(
  tournamentId: string,
  cocheId: string
): Promise<Resultado> {
  const yo = await miFicha();
  if (!yo) return { error: "No tienes una ficha vinculada" };

  const estado = await leerEstado(tournamentId);
  const permiso = puedeApuntarse(yo.playerId, cocheId, estado);
  if (!permiso.puede) return { error: MENSAJE_RECHAZO[permiso.motivo] };

  const { cambios } = efectosDeApuntarse(yo.playerId, cocheId, estado);
  const error = await aplicar(cambios, tournamentId);
  if (error) return { error };

  refrescar(tournamentId);
  return {};
}

/** Bajarse de un coche sin cambiar la asistencia al torneo. */
export async function bajarseDeCoche(tournamentId: string): Promise<Resultado> {
  const yo = await miFicha();
  if (!yo) return { error: "No tienes una ficha vinculada" };

  const estado = await leerEstado(tournamentId);
  const { cambios, avisos } = efectosDeBajarse(yo.playerId, estado);
  if (cambios.length === 0) return { error: "No vas en ningún coche de este torneo." };

  const error = await aplicar(cambios, tournamentId);
  if (error) return { error };

  await avisarDeCoches(avisos, await nombreTorneo(tournamentId));
  refrescar(tournamentId);
  return {};
}

/**
 * Borrar un coche. Sus pasajeros pierden la plaza y reciben aviso, pero **su
 * asistencia al torneo no se toca** (regla 5).
 *
 * Quién puede borrarlo lo decide la RLS (`conductor_id = mi_ficha()` o admin);
 * aquí se comprueba antes solo para dar un mensaje decente.
 */
export async function borrarCoche(
  tournamentId: string,
  cocheId: string
): Promise<Resultado> {
  const yo = await miFicha();
  if (!yo) return { error: "No tienes una ficha vinculada" };

  const estado = await leerEstado(tournamentId);
  const coche = estado.coches.find((c) => c.id === cocheId);
  if (!coche) return { error: "Ese coche ya no existe." };

  const { cambios, avisos } = efectosDeBorrarCoche(cocheId, estado);
  // Los avisos se mandan ANTES de borrar: después ya no se sabría a quién.
  await avisarDeCoches(avisos, await nombreTorneo(tournamentId));

  const error = await aplicar(cambios, tournamentId);
  if (error) return { error };

  refrescar(tournamentId);
  return {};
}

/**
 * Crea un torneo que no está en el calendario oficial de la FACV: amistosos,
 * torneos de otras federaciones, cosas puntuales.
 *
 * Permitido a **junta y admin**, no a cualquier socio: es raro que haga falta
 * —los 147 del calendario oficial ya están importados— y así la lista no se llena
 * de entradas duplicadas o mal escritas que alguien tenga que limpiar. Para ir a
 * un torneo del calendario no hace falta crear nada: basta decir que vas.
 */
export async function crearTorneoManual(datos: {
  nombre: string;
  fechaInicio: string;
  fechaFin?: string;
  lugar?: string;
  organizador?: string;
}): Promise<Resultado> {
  if (!(await esJunta())) return { error: "No autorizado" };

  const nombre = datos.nombre.trim();
  if (!nombre) return { error: "Ponle un nombre al torneo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaInicio)) {
    return { error: "La fecha de inicio no es válida." };
  }
  const fechaFin = datos.fechaFin?.trim() || datos.fechaInicio;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
    return { error: "La fecha de fin no es válida." };
  }
  if (fechaFin < datos.fechaInicio) {
    return { error: "El torneo no puede acabar antes de empezar." };
  }

  // Quién lo crea se guarda para que pueda deshacerlo él mismo (`borrarTorneoManual`).
  // La sesión hace falta aquí y no solo el `esJunta()` de arriba, que no dice quién es.
  const sesion = await sesionActual();

  const admin = createAdminClient();
  const { error } = await admin.from("tournaments").insert({
    nombre,
    fecha_inicio: datos.fechaInicio,
    fecha_fin: fechaFin,
    lugar: datos.lugar?.trim() || null,
    organizador: datos.organizador?.trim() || null,
    origen: "manual",
    creado_por: sesion?.userId ?? null,
    // Un torneo que alguien se toma la molestia de crear a mano es, por
    // definición, uno al que el club va: aparece en la lista desde el principio
    // sin esperar a que nadie se apunte.
    de_interes: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/club/torneos/facv");
  revalidatePath("/club/admin/torneos");
  revalidatePath("/club");
  return {};
}

/**
 * Borra un torneo creado a mano. Lo puede borrar QUIEN LO CREÓ (y cualquier admin).
 *
 * POR QUÉ EXISTE (pedido del propietario, 2026-08-11): borrar un torneo solo se podía
 * desde el panel de admin, escondido dentro del formulario de editar, y solo siendo
 * admin. Quien se equivocaba al crearlo no podía deshacerlo desde donde lo había
 * creado. Un torneo mal escrito o de prueba lo ve todo el club en su lista, así que
 * el arreglo tiene que estar a mano.
 *
 * LOS DEL CALENDARIO DE LA FACV NO SE BORRAN, y no es una cuestión de permisos: los
 * trae la sincronización semanal, así que borrar uno lo haría reaparecer el viernes.
 * Para quitarlo de la lista está el interruptor "de interés" del panel de admin.
 *
 * Se lleva por delante las asistencias y los coches del torneo (cascada de la 0010).
 * Es lo correcto —sin torneo no hay a dónde ir— y es lo que hace que quien lo borra
 * tenga que ver antes cuánta gente hay apuntada, que es trabajo de la pantalla.
 */
export async function borrarTorneoManual(tournamentId: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.esJunta) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: torneo } = await admin
    .from("tournaments")
    .select("id, origen, creado_por")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!torneo) return { error: "Ese torneo ya no existe." };

  if (torneo.origen !== "manual") {
    return {
      error:
        "Este torneo viene del calendario de la FACV: no se borra, se sincroniza solo. Quítale 'de interés' desde el panel.",
    };
  }
  // `creado_por` es null en los torneos creados antes de la 0038: esos solo los borra
  // un admin, porque no hay forma de saber de quién eran.
  if (!sesion.esAdmin && torneo.creado_por !== sesion.userId) {
    return { error: "Solo puede borrarlo quien lo creó." };
  }

  const { error } = await admin.from("tournaments").delete().eq("id", tournamentId);
  if (error) return { error: error.message };

  revalidatePath("/club/torneos/facv");
  revalidatePath("/club/admin/torneos");
  revalidatePath("/club");
  return {};
}

/** Editar el coche propio. No permite dejar menos plazas que pasajeros. */
export async function editarCoche(
  tournamentId: string,
  cocheId: string,
  datos: { plazas: number; horaSalida?: string; puntoSalida?: string; notas?: string }
): Promise<Resultado> {
  const yo = await miFicha();
  if (!yo) return { error: "No tienes una ficha vinculada" };

  const estado = await leerEstado(tournamentId);
  const permiso = puedeCambiarPlazas(cocheId, datos.plazas, estado);
  if (!permiso.puede) {
    return {
      error:
        permiso.motivo === "minimo_una_plaza"
          ? "Un coche tiene que ofrecer al menos una plaza."
          : `Ya llevas ${permiso.ocupadas} ${permiso.ocupadas === 1 ? "pasajero" : "pasajeros"}: no puedes dejarlo en ${datos.plazas}.`,
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("cars")
    .update({
      plazas: datos.plazas,
      hora_salida: datos.horaSalida?.trim() || null,
      punto_salida: datos.puntoSalida?.trim() || null,
      notas: datos.notas?.trim() || null,
    })
    .eq("id", cocheId);
  if (error) return { error: error.message };

  refrescar(tournamentId);
  return {};
}
