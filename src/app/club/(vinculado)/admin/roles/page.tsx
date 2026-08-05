import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { ListaRoles, type SocioConRoles } from "./ListaRoles";

export default async function AdminRolesPage() {
  // El layout de /club/admin ya ha comprobado que quien llega es admin, y la
  // policy de `member_roles` solo deja escribir a admin.
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const [{ data: perfiles }, { data: roles }, { data: capitanes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, is_admin, player_id, players(nombre)")
      .order("email"),
    supabase.from("member_roles").select("profile_id, rol"),
    // Capitanías de la temporada activa: el rango de capitán es por equipo y por
    // temporada, así que solo se muestran las vigentes.
    supabase
      .from("team_captains")
      .select("player_id, teams!inner(nombre, seasons!inner(activa))")
      .eq("teams.seasons.activa", true),
  ]);

  const rolesDe = new Map<string, Set<string>>();
  for (const r of roles ?? []) {
    if (!rolesDe.has(r.profile_id)) rolesDe.set(r.profile_id, new Set());
    rolesDe.get(r.profile_id)!.add(r.rol);
  }

  const equiposPorFicha = new Map<string, string[]>();
  for (const c of capitanes ?? []) {
    const nombre = (c.teams as unknown as { nombre: string } | null)?.nombre;
    if (!nombre) continue;
    equiposPorFicha.set(c.player_id, [
      ...(equiposPorFicha.get(c.player_id) ?? []),
      nombre,
    ]);
  }

  const socios: SocioConRoles[] = (perfiles ?? []).map((p) => {
    const suyos = rolesDe.get(p.id) ?? new Set<string>();
    const porColumna = Boolean(p.is_admin);
    return {
      profileId: p.id,
      email: p.email,
      ficha: (p.players as unknown as { nombre: string } | null)?.nombre ?? null,
      esJunta: suyos.has("junta"),
      // Las dos fuentes, igual que `is_admin()` en Postgres.
      esAdmin: porColumna || suyos.has("admin"),
      adminPorColumnaVieja: porColumna && !suyos.has("admin"),
      capitanDe: p.player_id ? (equiposPorFicha.get(p.player_id) ?? []) : [],
      esYo: p.id === sesion?.userId,
    };
  });

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Rangos"
        subtitulo="Quién puede qué en el club"
        volverA="/club/admin"
      />
      <div className="mx-auto max-w-md p-4 sm:max-w-2xl">
        <ListaRoles socios={socios} />
      </div>
    </main>
  );
}
