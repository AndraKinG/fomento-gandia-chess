import { NextResponse, type NextRequest } from "next/server";
import { pedirDisponibilidadSemana, recordarPendientes } from "@/lib/push/disponibilidad";

export const maxDuration = 300;

// Ventana ampliada SOLO para el parámetro de prueba `?forzar=`, para poder
// verificar el cron en local/producción sin depender de que haya una
// jornada real dentro de la ventana semanal habitual. La lógica real
// (lunes/jueves sin forzar) sigue usando los valores por defecto de
// `pedirDisponibilidadSemana`/`recordarPendientes` (7 y 4 días).
const DIAS_VENTANA_PRUEBA = 60;

/**
 * Cron "director de orquesta": según el día de la semana (UTC), decide qué
 * acción de disponibilidad ejecutar.
 * - Lunes (1): pide disponibilidad de la semana (`pedirDisponibilidadSemana`).
 * - Jueves (4): recuerda a quien no ha contestado (`recordarPendientes`).
 * - Viernes (5): sync FACV — se añade en la fase 1C. Dejar el switch listo.
 * - Resto de días: no hace nada.
 *
 * Acepta `?forzar=pedir|recordar` (gated por el mismo CRON_SECRET) para
 * pruebas manuales, con una ventana de días ampliada (ver arriba).
 */
export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forzar = searchParams.get("forzar");

  if (forzar === "pedir") {
    const resultado = await pedirDisponibilidadSemana(DIAS_VENTANA_PRUEBA);
    return NextResponse.json({ accion: "pedir", forzado: true, ...resultado });
  }
  if (forzar === "recordar") {
    const resultado = await recordarPendientes(DIAS_VENTANA_PRUEBA);
    return NextResponse.json({ accion: "recordar", forzado: true, ...resultado });
  }

  const dia = new Date().getUTCDay();
  switch (dia) {
    case 1: {
      // Lunes: pedir disponibilidad de la semana.
      const resultado = await pedirDisponibilidadSemana();
      return NextResponse.json({ dia, accion: "pedir", ...resultado });
    }
    case 4: {
      // Jueves: recordar a quien no ha contestado.
      const resultado = await recordarPendientes();
      return NextResponse.json({ dia, accion: "recordar", ...resultado });
    }
    // case 5: viernes — sync FACV, se añadirá en la fase 1C.
    default:
      return NextResponse.json({ dia, accion: "nada" });
  }
}
