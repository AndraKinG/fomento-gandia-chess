import { NextResponse } from "next/server";
import { registrarError } from "@/lib/errores/registrar";
import { MAX_DETALLE, MAX_MENSAJE, MAX_RUTA } from "@/lib/errores/firma";

/**
 * Recibe los errores del NAVEGADOR (los manda `CapturarErrores` y las pantallas de error).
 *
 * ES PÚBLICO, SIN SESIÓN, a propósito: también puede fallar la portada o el login, y ahí
 * no hay nadie dentro. Por eso no se fía de nada de lo que llega:
 * - el cuerpo entero tiene un tope (`MAX_CUERPO`) y cada campo se corta otra vez en
 *   `prepararError`;
 * - si la petición dice venir de otra web (`Origin` distinto), se rechaza: así otra
 *   página no puede usar a sus visitantes para llenarnos la tabla;
 * - los topes de verdad están en la base (`registrar_error`, 0052): 30 fallos nuevos por
 *   hora y 1000 filas como mucho. Ahí y no aquí porque en Vercel cada petición puede caer
 *   en un servidor distinto y un contador en memoria no se comparte.
 *
 * Siempre contesta 204 y sin cuerpo, haya guardado o no: al navegador no le sirve de nada
 * saberlo, y a quien esté probando qué pasa le da menos pistas.
 */

/** Holgado sobre lo que se guarda (el JSON escapa comillas y saltos de línea). */
const MAX_CUERPO = 2 * (MAX_MENSAJE + MAX_DETALLE + MAX_RUTA) + 1024;

export async function POST(request: Request) {
  const origen = request.headers.get("origin");
  if (origen && origen !== new URL(request.url).origin) {
    return new NextResponse(null, { status: 403 });
  }

  const texto = await request.text();
  if (texto.length > MAX_CUERPO) return new NextResponse(null, { status: 413 });

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object") return new NextResponse(null, { status: 400 });
  const { mensaje, ruta, detalle } = cuerpo as Record<string, unknown>;
  if (typeof mensaje !== "string" || typeof ruta !== "string") {
    return new NextResponse(null, { status: 400 });
  }

  await registrarError({
    origen: "navegador",
    mensaje,
    ruta,
    detalle: typeof detalle === "string" ? detalle : null,
    userAgent: request.headers.get("user-agent"),
  });
  return new NextResponse(null, { status: 204 });
}
