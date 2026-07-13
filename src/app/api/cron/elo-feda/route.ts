import { NextResponse, type NextRequest } from "next/server";
import { actualizarEloFeda } from "@/app/admin/elo/actions";

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await actualizarEloFeda();
  return NextResponse.json(resultado);
}
