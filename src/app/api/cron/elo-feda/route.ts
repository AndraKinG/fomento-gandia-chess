import { NextResponse, type NextRequest } from "next/server";
import { actualizarEloFedaCore } from "@/lib/import/feda-apply";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await actualizarEloFedaCore();
  return NextResponse.json(resultado);
}
