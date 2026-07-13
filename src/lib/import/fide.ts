/** Extrae el ELO standard de la página de perfil de ratings.fide.com. */
export function parseEloFideDesdePerfil(html: string): number | null {
  // El bloque "profile-standart" del perfil envuelve el icono std y el
  // valor del rating en un <p>NNNN</p> justo antes de la etiqueta "STANDARD".
  const m =
    /profile-standart[\s\S]{0,300}?<p>\s*(\d{3,4})\s*<\/p>/i.exec(html) ??
    /logo_std\.svg[\s\S]{0,300}?<p>\s*(\d{3,4})\s*<\/p>/i.exec(html);
  if (!m) return null;
  const elo = Number(m[1]);
  return elo >= 1000 && elo <= 3000 ? elo : null;
}
