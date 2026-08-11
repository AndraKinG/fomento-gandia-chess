import { CLUB_ID_FACV } from "@/lib/import/facv-config";

/**
 * El ELO REAL ACTUAL de los socios, desde el ranking público de la FACV.
 *
 * EL HALLAZGO QUE LO HIZO POSIBLE (2026-08-11, investigando una discrepancia que
 * señaló el propietario): el ranking de la FACV
 * (`ranking.php`) publica el **FIDE de clásicas AL DÍA** — verificado contra dos
 * perfiles FIDE reales (Santos Latasa 2620=2620; Crecente 2081=2081, mientras la
 * página del orden de fuerza le pone 2087, su ELO de cuando se creó el
 * documento). Y admite FILTRO POR CLUB mandando el formulario por POST, así que
 * una sola petición trae a todos los nuestros con ELO. Con el filtro puesto no
 * pagina (35 filas hoy); sin él, sí.
 *
 * Y LO MEJOR: es facv.org, no fide.com — **Vercel sí puede**, así que esto
 * automatiza por fin el ELO real que fide.com nos negaba (ver
 * docs/referencia/automatizaciones.md).
 *
 * Quien no aparece es que no tiene ELO FIDE de clásicas: se queda como está.
 */

export const URL_RANKING_FACV =
  "https://www.facv.org/appwebfacv/public/staff/elos/ranking.php?band=1";

/** Cuerpo del POST que filtra el ranking por nuestro club. */
export const CUERPO_FILTRO_CLUB = `licencia_sql%5Bgrupo_id%5D=${CLUB_ID_FACV}`;

export type FilaEloActual = { nombre: string; elo: number };

// Fila de la tabla: posición, jugador (con posible título "GM/IM/…" en un span),
// bandera, ELO, variación. El nombre viene "Nombre Apellidos".
const FILA_RE =
  /<tr>\s*<td>\d+<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>[\s\S]*?<\/td>\s*<td>(\d{3,4})<\/td>/g;

/** Los títulos FIDE que el ranking antepone al nombre y que NO son el nombre. */
const TITULOS_RE = /^(?:GM|IM|FM|CM|WGM|WIM|WFM|WCM)\s+/;

export function parseEloActualFACV(html: string): FilaEloActual[] {
  const filas: FilaEloActual[] = [];
  for (const m of html.matchAll(FILA_RE)) {
    const nombre = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(TITULOS_RE, "");
    const elo = Number(m[2]);
    if (nombre && elo > 0) filas.push({ nombre, elo });
  }
  return filas;
}
