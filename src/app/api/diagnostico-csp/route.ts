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
  // Por cabecera: si llega, y si lleva `script-src` (la nuestra) o `frame-ancestors` (la
  // base). Así se ve si a Next le llega la que tiene el nonce o la otra.
  const mirar = (nombre: string) => {
    const v = request.headers.get(nombre);
    return v === null
      ? "no llega"
      : `llega${v.includes("script-src") ? " · con script-src" : ""}${
          v.includes("frame-ancestors") ? " · con frame-ancestors" : ""
        }${v.includes(",") ? " · con coma (¿dos valores juntos?)" : ""}`;
  };
  return NextResponse.json(
    {
      "x-nonce": request.headers.has("x-nonce"),
      "content-security-policy": mirar("content-security-policy"),
      "content-security-policy-report-only": mirar("content-security-policy-report-only"),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
