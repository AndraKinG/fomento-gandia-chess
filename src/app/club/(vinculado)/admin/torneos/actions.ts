"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { enviarPushAMuchos } from "@/lib/push/send";
import { sincronizarTorneosFACVCore } from "@/lib/import/facv-torneos-apply";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import type { ResumenSyncTorneos } from "@/lib/import/facv-torneos-apply";

type Resultado = { error?: string };

function refrescar(id?: string): void {
  revalidatePath("/club/admin/torneos");
  revalidatePath("/club/torneos");
  revalidatePath("/club");
  if (id) revalidatePath(`/club/torneos/${id}`);
}

/**
 * Sincroniza el calendario oficial de torneos de la FACV.
 *
 * Aquí está el gate de autorización que `sincronizarTorneosFACVCore` no lleva
 * dentro, siguiendo el mismo patrón que el resto de los `*-apply.ts`.
 */
export async function sincronizarTorneos(): Promise<ResumenSyncTorneos> {
  if (!(await esAdmin())) {
    return { creados: 0, actualizados: 0, error: "No autorizado" };
  }
  const resumen = await sincronizarTorneosFACVCore();
  refrescar();
  return resumen;
}

/**
 * Marca o desmarca un torneo como "vamos como club".
 *
 * Al marcarlo se avisa al club por push, porque es la señal de "apúntate". Al
 * desmarcarlo no se avisa: nadie necesita una notificación para saber que algo
 * ha dejado de estar en una lista.
 */
export async function cambiarDeInteres(
  tournamentId: string,
  deInteres: boolean
): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: torneo, error } = await admin
    .from("tournaments")
    .update({ de_interes: deInteres })
    .eq("id", tournamentId)
    .select("nombre, fecha_inicio, fecha_fin, lugar")
    .single();
  if (error) return { error: error.message };

  if (deInteres && torneo) {
    // A todos los socios con cuenta y ficha: es una convocatoria abierta.
    try {
      const { data: perfiles } = await admin
        .from("profiles")
        .select("id")
        .not("player_id", "is", null);
      const ids = (perfiles ?? []).map((p) => p.id);
      if (ids.length > 0) {
        await enviarPushAMuchos(ids, {
          title: `Torneo: ${torneo.nombre}`,
          body: `${formatearRangoFechas(torneo.fecha_inicio, torneo.fecha_fin)}${torneo.lugar ? ` en ${torneo.lugar}` : ""}. ¿Vas?`,
          url: `/club/torneos/${tournamentId}`,
        });
      }
    } catch {
      // Un push que no sale no puede tumbar la operación: el torneo ya está
      // marcado y aparece en la lista de todas formas.
    }
  }

  refrescar(tournamentId);
  return {};
}

/**
 * Rellena a mano lo que la FACV no publica: hora, ritmo, información extra y
 * enlace a las bases. Son justo los campos que el re-sync nunca pisa.
 */
export async function editarFichaTorneo(
  tournamentId: string,
  datos: { hora?: string; ritmo?: string; infoExtra?: string; urlBases?: string }
): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "No autorizado" };

  const url = datos.urlBases?.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return { error: "El enlace a las bases tiene que empezar por http:// o https://" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tournaments")
    .update({
      hora: datos.hora?.trim() || null,
      ritmo: datos.ritmo?.trim() || null,
      info_extra: datos.infoExtra?.trim() || null,
      url_bases: url || null,
    })
    .eq("id", tournamentId);
  if (error) return { error: error.message };

  refrescar(tournamentId);
  return {};
}

/** Crea un torneo que no está en el calendario oficial de la FACV. */
export async function crearTorneoManual(datos: {
  nombre: string;
  fechaInicio: string;
  fechaFin?: string;
  lugar?: string;
  organizador?: string;
}): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "No autorizado" };

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

  const admin = createAdminClient();
  const { error } = await admin.from("tournaments").insert({
    nombre,
    fecha_inicio: datos.fechaInicio,
    fecha_fin: fechaFin,
    lugar: datos.lugar?.trim() || null,
    organizador: datos.organizador?.trim() || null,
    origen: "manual",
    // Un torneo que el admin se toma la molestia de crear a mano es, por
    // definición, uno al que el club va: no tiene sentido crearlo y tener que
    // marcarlo después.
    de_interes: true,
  });
  if (error) return { error: error.message };

  refrescar();
  return {};
}

/** Borra un torneo. Solo tiene sentido para los creados a mano. */
export async function borrarTorneo(tournamentId: string): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "No autorizado" };
  const admin = createAdminClient();
  const { error } = await admin.from("tournaments").delete().eq("id", tournamentId);
  if (error) return { error: error.message };
  refrescar();
  return {};
}
