export type FilaOF = {
  numero: number;
  bisIndex: number;
  nombre: string;
  eloOficial: number | null;
  fideId: string | null;
};

/** Página oficial del orden de fuerza del club (id 56 = Fomento Gandia). */
export const URL_OF_CLUB =
  "https://www.facv.org/appwebfacv/public/staff/of_club/of_publico.php?id=56";

const BADGE_RE = /class="badge[^"]*"[^>]*>\s*([0-9]+)\s*(bis)?\s*</i;
const NOMBRE_RE = /class="cut"[^>]*>\s*([^<]+?)\s*</i;
const ELO_RE = /col-elo[^>]*>\s*([0-9]{3,4})/i;
const FIDE_RE = /ratings\.fide\.com\/profile\/([0-9]+)/i;

function decodeEntidades(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrae las filas del orden de fuerza oficial FACV desde el HTML público del club. */
export function parseOrdenFuerzaFACV(html: string): FilaOF[] {
  const filas: FilaOF[] = [];
  for (const bloque of html.split(/<tr[\s>]/i).slice(1)) {
    const badge = BADGE_RE.exec(bloque);
    const nombre = NOMBRE_RE.exec(bloque);
    if (!badge || !nombre) continue;
    const elo = ELO_RE.exec(bloque);
    const fide = FIDE_RE.exec(bloque);
    filas.push({
      numero: Number(badge[1]),
      bisIndex: badge[2] ? 1 : 0,
      nombre: decodeEntidades(nombre[1]),
      eloOficial: elo ? Number(elo[1]) : null,
      fideId: fide ? fide[1] : null,
    });
  }
  return filas;
}
