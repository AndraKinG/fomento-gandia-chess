/**
 * Cliente de la API de ChessPairings: los torneos presenciales del club, leídos de allí.
 *
 * QUÉ ES Y POR QUÉ (decisión del propietario, 2026-08-26): un torneo del club puede
 * organizarse EN LA APP —rápido, entre unos cuantos, jugando aquí— o en **ChessPairings**
 * cuando es el social presencial y va en serio. Allí tienen lo que aquí no conviene
 * construir: el emparejamiento oficial de la FIDE (bbpPairings v6), 28 desempates y el
 * export TRF para homologar. Ver la migración 0050.
 *
 * SU API ES DE SOLO LECTURA, y está comprobado, no supuesto:
 *
 *     OPTIONS /tornei      → Access-Control-Allow-Methods: GET, OPTIONS
 *     DELETE  /torneo/5759 → 405 Method not allowed
 *
 * O sea que **crear el torneo, inscribir, emparejar y anotar resultados lo hace el
 * árbitro allí, a mano**. Desde aquí no se puede automatizar ni conviene intentarlo: es
 * justo lo que ellos dicen de su propio producto ("sin gestión: solo información").
 *
 * LO QUE SÍ ES AUTOMÁTICO ES TRAERLO. Con el id del torneo salen sus datos, sus
 * inscritos, sus rondas, sus emparejamientos y su clasificación con desempates.
 *
 * LA CLAVE NO PISA EL NAVEGADOR. `CHESSPAIRINGS_API_KEY` se lee solo en el servidor,
 * igual que la de Gemini: con ella se leen todos los torneos de la cuenta del club.
 *
 * SE CACHEA 60 SEGUNDOS, que es lo que hace su propio plugin de WordPress, y no por
 * gusto: la API devuelve **429** si se abusa. Una pantalla que se recarga no puede
 * significar una petición suya.
 *
 * ESTE MÓDULO ES CASI TODO PURO Y CON TESTS SOBRE SU JSON DE VERDAD (el del torneo 5759,
 * creado para esto). Es un formato ajeno: el día que cambien un nombre de campo, los
 * tests lo dicen en vez de que la clasificación salga en blanco.
 */

/** La base de su API v1, tal y como la usa su plugin oficial. */
export const BASE_CHESSPAIRINGS = "https://my.chesspairings.org/api/v1";

/** Lo que la API llama las cosas. En italiano, porque el proyecto lo es. */
type JugadorCrudo = {
  iscrizione_id?: number;
  cognome?: string;
  nome?: string;
  titolo?: string | null;
  rating?: number | null;
  rating_iniziale?: number | null;
  fide_id?: number | null;
  federazione?: string | null;
  punti_pre?: number | null;
};

export type TorneoChessPairings = {
  id: number;
  nombre: string;
  lugar: string | null;
  arbitro: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  /** `in_corso`, `concluso`… tal cual lo da la API. */
  estado: string;
  sistema: string | null;
  /** El motor que empareja: `bbp6` es bbpPairings v6. */
  motor: string | null;
  rondasTotales: number | null;
  rondaActual: number | null;
  inscritos: number | null;
  cadencia: string | null;
  /** La página pública, que la propia API devuelve: no hace falta pedírsela a nadie. */
  enlacePublico: string | null;
  /** `pubblico` o `privato`. Un torneo privado no tiene página que enseñar. */
  visibilidad: string | null;
};

export type FilaClasificacion = {
  posicion: number;
  /** El id de su inscripción: es lo que identifica a un jugador dentro del torneo. */
  inscripcionId: number | null;
  apellidos: string;
  nombre: string;
  titulo: string | null;
  federacion: string | null;
  rating: number | null;
  puntos: number;
  /** Los desempates que ellos calculan: Buchholz cortado, total, Sonneborn-Berger… */
  desempates: { buc1: number | null; buct: number | null; sb: number | null; vit: number | null };
};

export type MesaEmparejamiento = {
  mesa: number;
  blancas: { inscripcionId: number | null; apellidos: string; nombre: string; rating: number | null } | null;
  negras: { inscripcionId: number | null; apellidos: string; nombre: string; rating: number | null } | null;
  /** Desde las BLANCAS, con el vocabulario de la app: "1" | "0.5" | "0" | null. */
  resultado: "1" | "0.5" | "0" | null;
  /** true cuando no hay partida: alguien descansa esta ronda. */
  esBye: boolean;
};

/** Nombre presentable a partir de sus dos campos. */
export function nombreDe(j: JugadorCrudo | null | undefined): string {
  if (!j) return "";
  return [j.nome, j.cognome].filter(Boolean).join(" ").trim();
}

/**
 * Su resultado, al vocabulario de la app.
 *
 * SU CODIFICACIÓN, leída de un torneo real y no adivinada: `"1-0"`, `"0-1"`,
 * `"1/2-1/2"`, y `"+--"` para el bye (que además viene con `tipo: "bye"`). Es la misma
 * notación que ya usa el resto de la app, así que la traducción es directa.
 *
 * NULL ES "TODAVÍA NO SE HA JUGADO", y no es lo mismo que unas tablas: una ronda en
 * marcha tiene resultados a null y pintarlos como ½ sería inventarse la clasificación.
 */
export function resultadoDesdeBlancas(
  risultato: string | null | undefined
): "1" | "0.5" | "0" | null {
  const r = (risultato ?? "").trim();
  if (r === "1-0") return "1";
  if (r === "0-1") return "0";
  if (r === "1/2-1/2" || r === "0.5-0.5" || r === "½-½") return "0.5";
  // El bye y cualquier cosa que no reconozcamos: sin resultado de partida. Un bye puntúa
  // en SU clasificación, que es la que enseñamos, así que aquí no hay que recalcular nada.
  return null;
}

/** ¿Esta mesa es un descanso y no una partida? */
export function esBye(tipo: string | null | undefined, negras: unknown): boolean {
  return tipo === "bye" || negras == null;
}

/* ---------------------------------------------------------------------------
 * Mapeo de sus respuestas a lo nuestro. Puro: entra su JSON, sale lo que pinta
 * la pantalla.
 * ------------------------------------------------------------------------ */

const aNumero = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function mapearTorneo(json: Record<string, unknown>): TorneoChessPairings | null {
  const id = aNumero(json.id);
  if (id === null) return null;
  return {
    id,
    nombre: String(json.nome ?? "").trim() || `Torneo ${id}`,
    lugar: (json.luogo as string | null) || null,
    arbitro: (json.arbitro as string | null) || null,
    fechaInicio: (json.data_inizio as string | null) || null,
    fechaFin: (json.data_fine as string | null) || null,
    estado: String(json.stato ?? ""),
    sistema: (json.tipo_torneo as string | null) || null,
    motor: (json.motore_abbinamenti as string | null) || null,
    rondasTotales: aNumero(json.num_turni),
    rondaActual: aNumero(json.turno_corrente),
    inscritos: aNumero(json.num_iscritti),
    cadencia: (json.cadenza as string | null) || null,
    enlacePublico: (json.link_pubblico as string | null) || null,
    visibilidad: (json.visibilita as string | null) || null,
  };
}

export function mapearClasificacion(json: Record<string, unknown>): FilaClasificacion[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((bruto, i) => {
    const f = bruto as Record<string, unknown>;
    const sp = (f.spareggi ?? {}) as Record<string, unknown>;
    return {
      // Si no trae posición, vale el orden en el que viene: ya llega ordenada.
      posicion: aNumero(f.posizione) ?? i + 1,
      inscripcionId: aNumero(f.iscrizione_id),
      apellidos: String(f.cognome ?? "").trim(),
      nombre: String(f.nome ?? "").trim(),
      titulo: (f.titolo as string | null) || null,
      federacion: (f.federazione as string | null) || null,
      rating: aNumero(f.rating_iniziale) ?? aNumero(f.rating),
      puntos: aNumero(f.punti) ?? 0,
      desempates: {
        buc1: aNumero(sp.buc1),
        buct: aNumero(sp.buct),
        sb: aNumero(sp.sb),
        vit: aNumero(sp.vit),
      },
    };
  });
}

export function mapearEmparejamientos(json: Record<string, unknown>): MesaEmparejamiento[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((bruto, i) => {
    const m = bruto as Record<string, unknown>;
    const lado = (v: unknown) => {
      const j = v as JugadorCrudo | null;
      if (!j) return null;
      return {
        inscripcionId: aNumero(j.iscrizione_id),
        apellidos: String(j.cognome ?? "").trim(),
        nombre: String(j.nome ?? "").trim(),
        rating: aNumero(j.rating),
      };
    };
    return {
      mesa: aNumero(m.tavolo) ?? i + 1,
      blancas: lado(m.bianco),
      negras: lado(m.nero),
      resultado: resultadoDesdeBlancas(m.risultato as string | null),
      esBye: esBye(m.tipo as string | null, m.nero),
    };
  });
}

/** Los FIDE ID de sus inscritos, para cruzarlos con nuestras fichas. */
export function fideIdsDeInscritos(json: Record<string, unknown>): Map<number, number> {
  const salida = new Map<number, number>();
  for (const bruto of Array.isArray(json.items) ? json.items : []) {
    const f = bruto as Record<string, unknown>;
    const inscripcion = aNumero(f.iscrizione_id);
    const fide = aNumero(f.fide_id);
    if (inscripcion !== null && fide !== null) salida.set(inscripcion, fide);
  }
  return salida;
}

/**
 * El id del torneo a partir de un enlace pegado a mano.
 *
 * EXISTE PARA NO PEDIR DOS COSAS: el enlace público que se pega en la ficha del torneo ya
 * lleva el id (`torneo.php?id=5759&token=…`), así que no hace falta un campo más ni que
 * nadie busque un número en su panel.
 */
export function idDesdeEnlace(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = /[?&]id=(\d{1,9})\b/.exec(url);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
