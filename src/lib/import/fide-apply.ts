import { createAdminClient } from "@/lib/supabase/admin";
import { parseEloFideDesdePerfil } from "@/lib/import/fide";

/**
 * Lógica interna (sin gate de autorización) que recorre los jugadores con
 * `fide_id` asignado, consulta su perfil en ratings.fide.com y actualiza su
 * ELO FIDE.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes
 * que quien invoca es admin (ver `src/app/admin/elo/actions.ts`) o que la
 * petición trae el `CRON_SECRET` válido (ver `src/app/api/cron/elo-fide/route.ts`).
 */
export async function actualizarEloFideCore(): Promise<{
  actualizados: number;
  errores: number;
}> {
  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players").select("id, fide_id").not("fide_id", "is", null);

  let actualizados = 0;
  let errores = 0;
  for (const p of players ?? []) {
    try {
      const res = await fetch(`https://ratings.fide.com/profile/${p.fide_id}`, {
        headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
      });
      const elo = parseEloFideDesdePerfil(await res.text());
      if (elo !== null) {
        await admin.from("players").update({ elo_fide: elo }).eq("id", p.id);
        actualizados++;
      } else {
        errores++;
      }
    } catch {
      errores++;
    }
    await new Promise((r) => setTimeout(r, 500)); // cortesía con el servidor FIDE
  }
  return { actualizados, errores };
}
