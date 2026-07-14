// Actualiza el ELO FIDE de los jugadores del club consultando sus perfiles
// en ratings.fide.com. Pensado para ejecutarse desde GitHub Actions (las IPs
// de Vercel están bloqueadas por FIDE a nivel de red; las de GitHub no).
//
// Requiere en el entorno:
//   SUPABASE_URL               - URL del proyecto (https://xxxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY  - clave secreta (service role)
//
// Uso local:  node scripts/actualizar-elo-fide.mjs

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// Misma lógica que src/lib/import/fide.ts (mantener en sincronía)
function parseEloFideDesdePerfil(html) {
  const m =
    /profile-standart[\s\S]{0,300}?<p>\s*(\d{3,4})\s*<\/p>/i.exec(html) ??
    /logo_std\.svg[\s\S]{0,300}?<p>\s*(\d{3,4})\s*<\/p>/i.exec(html);
  if (!m) return null;
  const elo = Number(m[1]);
  return elo >= 1000 && elo <= 3000 ? elo : null;
}

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/players?select=id,fide_id&fide_id=not.is.null`,
  { headers: HEADERS }
);
if (!res.ok) {
  console.error(`Error leyendo jugadores: HTTP ${res.status}`);
  process.exit(1);
}
const players = await res.json();
console.log(`Jugadores con ID FIDE: ${players.length}`);

let actualizados = 0;
let errores = 0;
for (const p of players) {
  try {
    const perfil = await fetch(`https://ratings.fide.com/profile/${p.fide_id}`, {
      headers: { "user-agent": "FomentoGandiaClubApp/1.0 (GitHub Actions)" },
    });
    if (!perfil.ok) {
      errores++;
      console.error(`  ${p.fide_id}: HTTP ${perfil.status}`);
    } else {
      const elo = parseEloFideDesdePerfil(await perfil.text());
      if (elo !== null) {
        const upd = await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${p.id}`, {
          method: "PATCH",
          headers: HEADERS,
          body: JSON.stringify({ elo_fide: elo }),
        });
        if (upd.ok) {
          actualizados++;
          console.log(`  ${p.fide_id}: ${elo}`);
        } else {
          errores++;
          console.error(`  ${p.fide_id}: error guardando (HTTP ${upd.status})`);
        }
      } else {
        errores++;
        console.error(`  ${p.fide_id}: sin rating standard en el perfil`);
      }
    }
  } catch (e) {
    errores++;
    console.error(`  ${p.fide_id}: ${String(e).slice(0, 120)}`);
  }
  await new Promise((r) => setTimeout(r, 500)); // cortesía con el servidor FIDE
}

console.log(`Hecho: ${actualizados} actualizados, ${errores} errores`);
if (actualizados === 0 && players.length > 0) process.exit(1);
