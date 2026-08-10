import { NextResponse, type NextRequest } from "next/server";

/**
 * Sonda: ¿puede Vercel descargar la lista mensual de ELO de FIDE?
 *
 * De esto depende que el ELO FIDE se pueda automatizar. `fide.com` bloquea las
 * IPs de centro de datos y por eso hoy el ELO FIDE se actualiza a mano con
 * `scripts/actualizar-elo-fide.mjs`. Pero eso se comprobó rascando perfiles uno a
 * uno; descargar un fichero estático puede ser otra historia, y desde una IP
 * doméstica funciona (verificado el 2026-08-05: HTTP 200, 14 MB, menos de un
 * segundo). La única forma de saber si funciona desde Vercel es preguntárselo a
 * Vercel.
 *
 * NO descarga el fichero entero: pide solo las cabeceras con un Range de 1 KB.
 * Basta para saber si el servidor responde o bloquea, y evita traerse 14 MB a una
 * función serverless solo para probar.
 *
 * Vive bajo /api/cron para heredar dos cosas: el matcher del proxy la excluye
 * (no exige sesión) y el gate de CRON_SECRET la protege de curiosos.
 *
 * Cómo llamarla, con el CRON_SECRET de las variables de entorno de Vercel:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://<dominio>/api/cron/sonda-fide
 *
 * Es temporal: en cuanto se sepa la respuesta, o se construye el importador
 * mensual o se borra este fichero.
 */

const LISTA_FIDE = "https://ratings.fide.com/download/standard_rating_list_xml.zip";

export async function GET(request: NextRequest) {
  // La comprobación de secreto VACÍO es parte del guard, no un adorno: sin ella,
  // con CRON_SECRET sin definir la cabecera "Bearer undefined" (literal) pasaría.
  // Es la misma guarda que llevan las otras rutas de cron.
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const comenzado = Date.now();
  try {
    const r = await fetch(LISTA_FIDE, {
      headers: { "user-agent": "Mozilla/5.0", range: "bytes=0-1023" },
      signal: AbortSignal.timeout(20_000),
    });

    return NextResponse.json({
      alcanzable: r.ok,
      status: r.status,
      tipo: r.headers.get("content-type"),
      // Con Range aceptado llega 206 y esta cabecera dice el tamaño total.
      rango: r.headers.get("content-range"),
      tamanoDeclarado: r.headers.get("content-length"),
      ms: Date.now() - comenzado,
      veredicto: r.ok
        ? "Vercel SÍ puede descargarla: el ELO FIDE se puede automatizar una vez al mes"
        : `Vercel recibe HTTP ${r.status}: sigue haciendo falta el script en local`,
    });
  } catch (e) {
    return NextResponse.json({
      alcanzable: false,
      ms: Date.now() - comenzado,
      error: e instanceof Error ? e.message : "desconocido",
      veredicto:
        "Vercel no llega al fichero (bloqueo o tiempo de espera): sigue haciendo falta el script en local",
    });
  }
}
