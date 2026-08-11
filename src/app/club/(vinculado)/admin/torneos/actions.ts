"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin } from "@/lib/auth/es-admin";
import { avisar } from "@/lib/avisos/enviar";
import { sincronizarTorneosFACVCore } from "@/lib/import/facv-torneos-apply";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import type { ResumenSyncTorneos } from "@/lib/import/facv-torneos-apply";

type Resultado = { error?: string };

function refrescar(id?: string): void {
  revalidatePath("/club/admin/torneos");
  revalidatePath("/club/torneos/facv");
  revalidatePath("/club");
  if (id) revalidatePath(`/club/torneos/facv/${id}`);
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
        await avisar(ids, {
          tipo: "torneo_interes",
          titulo: `Torneo: ${torneo.nombre}`,
          cuerpo: `${formatearRangoFechas(torneo.fecha_inicio, torneo.fecha_fin)}${torneo.lugar ? ` en ${torneo.lugar}` : ""}. ¿Vas?`,
          url: `/club/torneos/facv/${tournamentId}`,
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

/**
 * Borra un torneo creado a mano, desde el panel.
 *
 * Es el camino de admin; el de quien lo creó está en `borrarTorneoManual`
 * (`torneos/facv/actions.ts`), que es donde vive el botón del propio torneo.
 *
 * SOLO LOS CREADOS A MANO, y ahora se comprueba en el servidor: el botón ya se
 * pintaba solo para esos (`t.esManual`), pero la acción se lo creía. Borrar uno del
 * calendario de la FACV no arregla nada porque la sincronización del viernes lo
 * vuelve a traer — para quitarlo de la lista está el interruptor "de interés".
 */
export async function borrarTorneo(tournamentId: string): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "No autorizado" };
  const admin = createAdminClient();
  const { data: torneo } = await admin
    .from("tournaments")
    .select("origen")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!torneo) return { error: "Ese torneo ya no existe." };
  if (torneo.origen !== "manual") {
    return {
      error:
        "Este torneo viene del calendario de la FACV: la sincronización lo traería otra vez. Quítale 'de interés'.",
    };
  }
  const { error } = await admin.from("tournaments").delete().eq("id", tournamentId);
  if (error) return { error: error.message };
  refrescar();
  return {};
}
