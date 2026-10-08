import { NextResponse } from "next/server";
import { registrarError } from "@/lib/errores/registrar";
import { leerAvisoCsp } from "@/lib/seguridad/csp";

/**
 * Recibe los avisos de la CSP de scripts (`report-uri` de `src/lib/seguridad/csp.ts`) y
 * los manda a la lista de errores, donde salen como "CSP: bloquearía …".
 *
 * PÚBLICO Y SIN SESIÓN, como `/api/errores`: los manda el navegador por su cuenta, sin
 * cookies. Mismas defensas: tope de tamaño, se descartan los avisos de páginas que no son
 * nuestras (`leerAvisoCsp`), y los topes de verdad están en la base (0052).
 *
 * El navegador no lee la respuesta: siempre 204.
 */

const MAX_CUERPO = 16 * 1024;

export async function POST(request: Request) {
  const texto = await request.text();
  if (texto.length > MAX_CUERPO) return new NextResponse(null, { status: 413 });

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");
  for (const aviso of leerAvisoCsp(cuerpo, new URL(request.url).origin)) {
    await registrarError({ origen: "navegador", ...aviso, userAgent });
  }
  return new NextResponse(null, { status: 204 });
}
