export type JornadaFACV = {
  grupo: string;
  ronda: number;
  fecha: string | null;
  local: string;
  visitante: string;
};

/**
 * Página pública del calendario de Interclubs (id 1428 = temporada 2026).
 *
 * Investigado con curl (-A "Mozilla/5.0"): `r` selecciona la ronda a mostrar
 * (`r=1`..`r=11`, un fetch por ronda) salvo `r=0`, que devuelve TODAS las
 * rondas de TODOS los grupos en una única respuesta (335 encuentros de ~30
 * grupos en una sola petición, verificado el 2026-07-14). `club_id` no filtra
 * el HTML devuelto (se probó `club_id=3`: misma cantidad de datos que
 * `club_id=0`), así que se deja en 0 y el filtrado por club se hace aquí, en
 * el parser. `r=0` es por tanto la única URL que hace falta pedir: cero
 * iteración de rondas y menos peticiones que cualquier alternativa.
 */
export const URL_CALENDARIO =
  "https://www.facv.org/appwebfacv/public/staff/interclubs/calendario_publico.php?id=1428&modo=completo&sede_id=0&club_id=0&r=0";

// Marca el inicio de la sección de un grupo: "<div class="grupo-title">NOMBRE</div>".
const GRUPO_RE = /<div class="grupo-title">([^<]+)<\/div>/g;
// Marca el inicio de la tarjeta de una ronda dentro de un grupo:
// `<div class="col-12 col-md-6 col-xl-4" id="gNNN_rM">` (NNN = id de grupo, M = ronda).
const RONDA_RE = /<div class="col-12 col-md-6 col-xl-4" id="g\d+_r(\d+)">/g;
const FECHA_RE = /(\d{2})\/(\d{2})\/(\d{4})/;
const HORA_RE = /🕒\s*(\d{2}:\d{2})/;
const NOMBRE_EQUIPO_RE = /team-name'>([^<]+)</g;

function decodeEntidades(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Aacute;/g, "Á")
    .replace(/&aacute;/g, "á")
    .replace(/&Eacute;/g, "É")
    .replace(/&eacute;/g, "é")
    .replace(/&Iacute;/g, "Í")
    .replace(/&iacute;/g, "í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&oacute;/g, "ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&uacute;/g, "ú")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Día (1-31) del último domingo de `mes` (1-12) en `anio`, ambos meses de 31 días. */
function ultimoDomingo(anio: number, mes: number): number {
  const diaDeSemana = new Date(Date.UTC(anio, mes - 1, 31)).getUTCDay(); // 0 = domingo
  return 31 - diaDeSemana;
}

/**
 * Offset horario de Madrid (Europe/Madrid) para una fecha-hora local naive
 * ("YYYY-MM-DDTHH:mm[:ss]"), calculado aritméticamente sin depender del reloj
 * del sistema (nada de `Date.now`) ni de librerías de zonas horarias.
 *
 * Regla española de horario de verano: +02:00 desde el último domingo de
 * marzo (02:00) hasta el último domingo de octubre (03:00); el resto del año,
 * +01:00. Simplificación asumida (suficiente para esta app, que no agenda
 * partidas de madrugada): la decisión se toma por FECHA, no por hora exacta
 * del cambio — el propio día del último domingo de marzo ya cuenta como
 * verano, y el propio día del último domingo de octubre ya cuenta como
 * invierno.
 */
export function offsetMadrid(fechaISO: string): "+01:00" | "+02:00" {
  const anio = Number(fechaISO.slice(0, 4));
  const mesDia = fechaISO.slice(5, 10); // "MM-DD"

  const inicioVerano = `03-${pad2(ultimoDomingo(anio, 3))}`;
  const finVerano = `10-${pad2(ultimoDomingo(anio, 10))}`;

  const esVerano = mesDia >= inicioVerano && mesDia < finVerano;
  return esVerano ? "+02:00" : "+01:00";
}

/** Quita acentos y pasa a minúsculas para comparar nombres de club/equipo. */
export function normalizaNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Extrae del HTML público del calendario FACV los encuentros donde local o
 * visitante contengan `nombreClub` (comparación insensible a mayúsculas y
 * acentos), con su grupo, ronda y fecha/hora.
 */
export function parseCalendarioFACV(html: string, nombreClub: string): JornadaFACV[] {
  const clubNorm = normalizaNombre(nombreClub);
  if (!clubNorm) return [];

  const grupos = [...html.matchAll(GRUPO_RE)].map((m) => ({
    index: m.index ?? 0,
    nombre: decodeEntidades(m[1]),
  }));
  const rondas = [...html.matchAll(RONDA_RE)].map((m) => ({
    index: m.index ?? 0,
    ronda: Number(m[1]),
  }));

  const jornadas: JornadaFACV[] = [];

  for (let i = 0; i < rondas.length; i++) {
    const inicio = rondas[i].index;
    const fin = i + 1 < rondas.length ? rondas[i + 1].index : html.length;
    const bloque = html.slice(inicio, fin);

    let grupoActual = "";
    for (const g of grupos) {
      if (g.index > inicio) break;
      grupoActual = g.nombre;
    }

    const fechaMatch = FECHA_RE.exec(bloque);
    const fecha = fechaMatch ? `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}` : null;
    const horaMatch = HORA_RE.exec(bloque);
    const fechaHora = fecha && horaMatch ? `${fecha}T${horaMatch[1]}:00` : fecha;

    for (const filaBloque of bloque.split(/<tr[\s>]/i).slice(1)) {
      const nombres = [...filaBloque.matchAll(NOMBRE_EQUIPO_RE)].map((m) =>
        decodeEntidades(m[1])
      );
      if (nombres.length !== 2) continue;
      const [local, visitante] = nombres;
      const esDelClub =
        normalizaNombre(local).includes(clubNorm) ||
        normalizaNombre(visitante).includes(clubNorm);
      if (!esDelClub) continue;

      jornadas.push({ grupo: grupoActual, ronda: rondas[i].ronda, fecha: fechaHora, local, visitante });
    }
  }

  return jornadas;
}
