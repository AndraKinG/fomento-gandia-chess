import { NextResponse, type NextRequest } from "next/server";
import { avisarRondasProximas } from "@/lib/torneos/avisar-rondas";

export const maxDuration = 60;

/**
 * Avisos de "tu ronda empieza en una hora".
 *
 * NO LO LLAMA VERCEL, lo llama pg_cron desde dentro de Supabase cada cinco minutos
 * (ver la migración 0037). El motivo: el aviso tiene que salir una hora antes de una
 * hora cualquiera, y el cron de Vercel en el plan gratuito solo se despierta una vez
 * al día — el de `vercel.json`, a las 9:00, que sigue con lo semanal.
 *
 * Mismo secreto que el otro cron (`CRON_SECRET`): un endpoint que manda pushes al
 * club no puede quedar abierto. POST porque es lo que manda `net.http_post`, y GET
 * además para poder probarlo a mano con curl.
 */
async function ejecutar(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // `avisarRondasProximas` nunca lanza (ver su cabecera): lo peor que puede pasar
  // es que devuelva ceros y lo cuente en los logs de Vercel.
  const resultado = await avisarRondasProximas();
  return NextResponse.json({ accion: "rondas", ...resultado });
}

export async function POST(request: NextRequest) {
  return ejecutar(request);
}

export async function GET(request: NextRequest) {
  return ejecutar(request);
}
