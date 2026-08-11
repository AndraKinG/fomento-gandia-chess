"use server";

import { esAdmin } from "@/lib/auth/es-admin";
import { actualizarEloFideCore } from "@/lib/import/fide-apply";

// FEDA se retiró entera el 2026-08-11 (no publican listas desde 2023): sus dos
// acciones y el importador están en el historial de git por si algún día vuelve.

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
