// Actualiza los ELOs FIDE del club leyendo el perfil de cada socio en
// ratings.fide.com: las TRES modalidades (clásicas, rápidas y blitz) y la VARIACIÓN
// PENDIENTE de cada una — los puntos ganados o perdidos desde la última publicación
// mensual, que es lo que la FIDE enseña como "Expected +5".
//
// HAY QUE EJECUTARLO A MANO, DESDE CASA, y no es un olvido: fide.com bloquea las IPs de
// centro de datos, así que ni Vercel ni GitHub Actions pueden con esto (verificado con
// una sonda en 2026-08-11: `fetch failed` a los 10,5 s). Por eso se guarda también
// `elo_fide_leido_en`: un número que se mueve cada día tiene que decir de cuándo es.
//
// EL PARSEO NO ESTÁ AQUÍ, está en `src/lib/import/fide-perfil.ts` y con tests sobre HTML
// real. Antes este script llevaba su propia copia con un comentario de "mantener en
// sincronía" con un módulo que ya no existe — o sea que la copia se quedó sola y sin
// pruebas, que es exactamente lo que pasa con las copias.
//
// Requiere en el entorno:
//   SUPABASE_URL               - URL del proyecto (https://xxxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY  - clave secreta (service role)
//
// Uso:
//   node --experimental-strip-types --import ./scripts/cargar-ts.mjs scripts/actualizar-elo-fide.mjs

import { readFileSync } from "node:fs";
import { parsearPerfilFide } from "@/lib/import/fide-perfil";

/**
 * Las claves, del entorno o de `.env.local`.
 *
 * LEE EL FICHERO PARA NO TENER QUE ESCRIBIR LA CLAVE EN LA TERMINAL: es la secreta del
 * proyecto, y una clave pegada en una línea de comandos se queda en el historial del
 * shell. El fichero ya está gitignorado y es de donde las lee la propia app.
 */
function delEntornoOdelFichero(...nombres) {
  for (const n of nombres) if (process.env[n]) return process.env[n];
  try {
    const texto = readFileSync(".env.local", "utf8");
    for (const linea of texto.split(/\r?\n/)) {
      const i = linea.indexOf("=");
      if (i < 0 || linea.trimStart().startsWith("#")) continue;
      const clave = linea.slice(0, i).trim();
      if (nombres.includes(clave)) return linea.slice(i + 1).trim();
    }
  } catch {
    // Sin `.env.local` no pasa nada: se avisa más abajo.
  }
  return undefined;
}

const SUPABASE_URL = delEntornoOdelFichero("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = delEntornoOdelFichero("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (ni en el entorno ni en .env.local)");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/players?select=id,nombre,fide_id&fide_id=not.is.null`,
  { headers: HEADERS }
);
if (!res.ok) {
  console.error(`Error leyendo jugadores: HTTP ${res.status}`);
  process.exit(1);
}
const players = await res.json();
console.log(`Jugadores con ID FIDE: ${players.length}`);

/** "1934 (+23,4)" para el registro de la consola. */
function comoTexto(r) {
  if (r.elo === null) return "—";
  if (r.variacion === null || r.variacion === 0) return String(r.elo);
  const v = Math.round(r.variacion * 10) / 10;
  return `${r.elo} (${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(1)})`;
}

let actualizados = 0;
let errores = 0;
// SIN ELO NO ES UN ERROR, y contarlo como tal era enganoso: hay 10 socios con ficha
// FIDE y ningun rating todavia -- estan federados pero no han jugado nada valido. Son
// justo los que necesitan el ELO estimado que pone la junta a mano.
let sinElo = 0;
for (const p of players) {
  try {
    const perfil = await fetch(`https://ratings.fide.com/profile/${p.fide_id}`, {
      headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
    });
    if (!perfil.ok) {
      errores++;
      console.error(`  ${p.nombre}: HTTP ${perfil.status}`);
    } else {
      const r = parsearPerfilFide(await perfil.text());
      if (r.clasicas.elo === null && r.rapidas.elo === null && r.blitz.elo === null) {
        // NO SE ESCRIBE NADA en este caso, a propósito: si la FIDE rediseñara la página
        // o devolviera un error con HTTP 200, machacar los ELOs con null borraría datos
        // buenos de los 46 socios de una pasada.
        sinElo++;
        console.log(`  ${p.nombre}: sin ELO FIDE todavía`);
      } else {
        const upd = await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${p.id}`, {
          method: "PATCH",
          headers: HEADERS,
          body: JSON.stringify({
            // El de clásicas solo si viene: es el que manda para el Interclubs y no se
            // pisa con null por un perfil a medias.
            ...(r.clasicas.elo !== null ? { elo_fide: r.clasicas.elo } : {}),
            elo_fide_rapidas: r.rapidas.elo,
            elo_fide_blitz: r.blitz.elo,
            variacion_fide: r.clasicas.variacion,
            variacion_fide_rapidas: r.rapidas.variacion,
            variacion_fide_blitz: r.blitz.variacion,
            elo_fide_leido_en: new Date().toISOString(),
          }),
        });
        if (upd.ok) {
          actualizados++;
          console.log(
            `  ${p.nombre}: clásicas ${comoTexto(r.clasicas)} · rápidas ${comoTexto(r.rapidas)} · blitz ${comoTexto(r.blitz)}`
          );
        } else {
          errores++;
          console.error(`  ${p.nombre}: error guardando (HTTP ${upd.status})`);
        }
      }
    }
  } catch (e) {
    errores++;
    console.error(`  ${p.nombre}: ${String(e).slice(0, 120)}`);
  }
  await new Promise((r) => setTimeout(r, 500)); // cortesía con el servidor FIDE
}

console.log(`Hecho: ${actualizados} actualizados, ${sinElo} sin ELO todavía, ${errores} errores`);

// SOLO ES FALLO SI NO SE ACTUALIZÓ NADIE. Con cero actualizados y 46 fichas, o la FIDE
// ha cambiado la página o no hay red: eso sí hay que verlo en el registro de la tarea
// programada. Que diez socios no tengan ELO es normal y no debe pintar la tarea en rojo.
if (actualizados === 0 && players.length > 0) process.exit(1);
