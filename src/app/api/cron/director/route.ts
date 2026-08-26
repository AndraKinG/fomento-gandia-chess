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
 * Cron "director de orquesta": según el día de la semana (UTC), decide qué toca.
 *
 * EL CALENDARIO SALE DE CUÁNDO SE JUEGA DE VERDAD, y esto se corrigió el 2026-08-26
 * mirando las 31 jornadas de la temporada 2026: **28 se jugaron en SÁBADO y 3 en
 * domingo, todas a las 17:00**. Ninguna en viernes. Y la sincronización estaba puesta el
 * VIERNES, o sea el día ANTES de la jornada: recogía los resultados del sábado anterior
 * con **seis días de retraso**, y durante toda la semana la app enseñaba la clasificación
 * vieja. Era el peor día posible de los siete.
 *
 * - **Domingo (0): sincroniza.** El día después de la jornada, que es cuando la FACV
 *   publica los resultados —el mismo sábado por la noche o el domingo—.
 * - **Lunes (1): pide disponibilidad Y VUELVE A SINCRONIZAR.** La segunda pasada es la
 *   red: si el domingo la FACV aún no había subido las actas, el lunes ya están, y así no
 *   hay que esperar una semana entera. Es lo que pidió el propietario ("dos crones para
 *   el resultado, por si el primero llama y no recoge info").
 * - **Jueves (4): recuerda** a quien no ha contestado la disponibilidad (2 días antes de
 *   la jornada del sábado).
 * - Resto de días: solo el reintento de avisos.
 *
 * POR QUÉ DOS PASADAS Y NO DOS CRONES DE VERCEL: el plan Hobby permite UNA ejecución al
 * día, así que un segundo cron no existe. Pero un día puede hacer dos cosas, y sale
 * gratis. La sincronización es idempotente (crea o actualiza, nunca duplica) y tarda
 * ~18 s, así que repetirla no cuesta nada.
 *
 * SE HACE TODO EL AÑO y no solo en temporada de Interclubs: fuera de temporada no hay
 * jornadas nuevas que traer, la pasada no encuentra nada y termina igual de rápido.
 * Condicionarlo por meses sería una fecha más que mantener a cambio de nada.
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
    case 0: {
      // Domingo: el día después de la jornada. Primera pasada por los resultados.
      const resultado = await sincronizarSemanalCore();
      return NextResponse.json({ dia, accion: "sync", avisos, ...resultado });
    }
    case 1: {
      // Lunes: la disponibilidad de la semana Y la segunda pasada de la sync.
      //
      // EL ORDEN IMPORTA: primero sincronizar y después pedir. La sync puede crear la
      // jornada de este fin de semana si la FACV la publicó tarde, y pidiendo antes se
      // pediría disponibilidad para una jornada que todavía no existe en la base.
      const sync = await sincronizarSemanalCore();
      const resultado = await pedirDisponibilidadSemana();
      return NextResponse.json({ dia, accion: "pedir+sync", avisos, sync, ...resultado });
    }
    case 4: {
      // Jueves: recordar a quien no ha contestado, dos días antes del sábado.
      const resultado = await recordarPendientes();
      return NextResponse.json({ dia, accion: "recordar", avisos, ...resultado });
    }
    default:
      return NextResponse.json({ dia, accion: "nada", avisos });
  }
}
