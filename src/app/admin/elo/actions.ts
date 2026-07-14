"use server";

import { esAdmin } from "@/lib/auth/es-admin";
import { actualizarEloFedaCore, aplicarListaFedaCore } from "@/lib/import/feda-apply";
import { actualizarEloFideCore } from "@/lib/import/fide-apply";

/**
 * Descarga la página oficial de listas ELO FEDA, localiza el enlace .xlsx
 * más reciente y aplica esa lista a los jugadores del club.
 * Acción de servidor gateada por sesión admin: NO la invoca el cron
 * (que usa `actualizarEloFedaCore` directamente tras validar `CRON_SECRET`).
 */
export async function actualizarEloFeda(): Promise<{
  actualizados: number;
  error?: string;
}> {
  if (!(await esAdmin())) {
    return { actualizados: 0, error: "Solo el admin puede hacer esto" };
  }
  return actualizarEloFedaCore();
}

/**
 * Recorre los jugadores con `fide_id` asignado, consulta su perfil en
 * ratings.fide.com y actualiza su ELO FIDE.
 * Acción de servidor gateada por sesión admin: NO la invoca el cron
 * (que usa `actualizarEloFideCore` directamente tras validar `CRON_SECRET`).
 */
export async function actualizarEloFide(): Promise<{
  actualizados: number;
  errores: number;
  error?: string;
}> {
  if (!(await esAdmin())) {
    return { actualizados: 0, errores: 0, error: "Solo el admin puede hacer esto" };
  }
  return actualizarEloFideCore();
}

/**
 * Aplica una lista FEDA (xlsx) ya descargada/subida a los jugadores del club.
 * Acción de servidor gateada por sesión admin.
 */
export async function aplicarListaFeda(
  buffer: ArrayBuffer
): Promise<{ actualizados: number; error?: string }> {
  if (!(await esAdmin())) {
    return { actualizados: 0, error: "Solo el admin puede hacer esto" };
  }
  return aplicarListaFedaCore(buffer);
}
