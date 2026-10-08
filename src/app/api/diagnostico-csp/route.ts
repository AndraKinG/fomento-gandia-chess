import { NextResponse } from "next/server";

/**
 * TEMPORAL (2026-10-08) — BORRAR en cuanto la CSP de scripts lleve nonce en producción.
 *
 * En Vercel los scripts de Next salían sin nonce aunque en local sí lo llevaban. Esto
 * dice qué cabeceras de las que añade el proxy le llegan de verdad a la app en Vercel.
 * Solo SÍ/NO, nunca los valores: el nonce no debe salir de su petición.
 *
 * Pasa por el proxy (no está en las exclusiones de su `matcher`), que es lo que se
 * quiere medir.
 */
export async function GET(request: Request) {
  const tiene = (nombre: string) => request.headers.has(nombre);
  return NextResponse.json(
    {
      "x-nonce": tiene("x-nonce"),
      "content-security-policy": tiene("content-security-policy"),
      "content-security-policy-report-only": tiene("content-security-policy-report-only"),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
