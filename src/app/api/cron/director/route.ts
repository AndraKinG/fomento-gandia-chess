import { NextResponse, type NextRequest } from "next/server";
import { pedirDisponibilidadSemana, recordarPendientes } from "@/lib/push/disponibilidad";
import { sincronizarSemanalCore } from "@/lib/import/sync-semanal";
import { reintentarAvisosFallidos } from "@/lib/avisos/reintentar";

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
 * - Viernes (5): las tres sincronizaciones con la FACV en cadena
 *   (`sincronizarSemanalCore`): orden de fuerza, resultados y clasificación, y actas
 *   por tablero. El orden importa, ver ese fichero.
 * - Resto de días: no hace nada.
 *
 * Acepta `?forzar=pedir|recordar|sync` (gated por el mismo CRON_SECRET) para
 * pruebas manuales; `forzar=sync` no depende de ventana de días (a diferencia
 * de pedir/recordar): la sync de resultados no tiene "ventana semanal", se
 * puede ejecutar cualquier día sin más criterio que forzarla.
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

  // Reintento de avisos fallidos (y `pendiente` huérfanos): TODOS LOS DÍAS,
  // no solo el día que le tocaría si se multiplexara como lo de abajo. El
  // multiplexado por día de semana es para tareas SEMANALES (pedir una vez,
  // recordar una vez, sincronizar una vez); un aviso que se quedó sin
  // entregar no tiene "su día de la semana", cuanto antes se reintente
  // mejor. Es barato — `notifications_a_reintentar` es un índice parcial y
  // lo normal es 0 filas — así que no hace falta ahorrárselo ningún día.
  // `reintentarAvisosFallidos` nunca lanza (ver su cabecera): un fallo ahí
  // no puede tumbar la acción del día, así que va suelta y antes que nada.
  const avisos = await reintentarAvisosFallidos();

  if (forzar === "pedir") {
    const resultado = await pedirDisponibilidadSemana(DIAS_VENTANA_PRUEBA);
    return NextResponse.json({ accion: "pedir", forzado: true, avisos, ...resultado });
  }
  if (forzar === "recordar") {
    const resultado = await recordarPendientes(DIAS_VENTANA_PRUEBA);
    return NextResponse.json({ accion: "recordar", forzado: true, avisos, ...resultado });
  }
  if (forzar === "sync") {
    const resultado = await sincronizarSemanalCore();
    return NextResponse.json({ accion: "sync", forzado: true, avisos, ...resultado });
  }

  const dia = new Date().getUTCDay();
  switch (dia) {
    case 1: {
      // Lunes: pedir disponibilidad de la semana.
      const resultado = await pedirDisponibilidadSemana();
      return NextResponse.json({ dia, accion: "pedir", avisos, ...resultado });
    }
    case 4: {
      // Jueves: recordar a quien no ha contestado.
      const resultado = await recordarPendientes();
      return NextResponse.json({ dia, accion: "recordar", avisos, ...resultado });
    }
    case 5: {
      // Viernes: las tres sincronizaciones con la FACV, en cadena.
      const resultado = await sincronizarSemanalCore();
      return NextResponse.json({ dia, accion: "sync", avisos, ...resultado });
    }
    default:
      return NextResponse.json({ dia, accion: "nada", avisos });
  }
}
