import { NextResponse, type NextRequest } from "next/server";
import { actualizarEloFideCore } from "@/lib/import/fide-apply";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await actualizarEloFideCore();
  return NextResponse.json(resultado);
}
