import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEloFideDesdePerfil } from "@/lib/import/fide";

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players").select("id, fide_id").not("fide_id", "is", null);

  const resultados: Record<string, string> = {};
  for (const p of players ?? []) {
    try {
      const res = await fetch(`https://ratings.fide.com/profile/${p.fide_id}`, {
        headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
      });
      const elo = parseEloFideDesdePerfil(await res.text());
      if (elo !== null) {
        await admin.from("players").update({ elo_fide: elo }).eq("id", p.id);
        resultados[p.fide_id!] = `ok ${elo}`;
      } else {
        resultados[p.fide_id!] = "sin rating";
      }
      await new Promise((r) => setTimeout(r, 500)); // cortesía con el servidor FIDE
    } catch (e) {
      resultados[p.fide_id!] = `error: ${String(e)}`;
    }
  }
  return NextResponse.json({ actualizados: resultados });
}
