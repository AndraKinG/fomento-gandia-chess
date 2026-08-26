import {
  BASE_CHESSPAIRINGS,
  mapearClasificacion,
  mapearEmparejamientos,
  mapearTorneo,
  fideIdsDeInscritos,
  type FilaClasificacion,
  type MesaEmparejamiento,
  type TorneoChessPairings,
} from "@/lib/import/chesspairings";

/**
 * Traer de ChessPairings lo que hace falta para pintar un torneo presencial del club.
 *
 * SOLO SERVIDOR. `CHESSPAIRINGS_API_KEY` da acceso a TODOS los torneos de la cuenta del
 * club, así que no puede pisar el navegador — igual que la de Gemini. Estas funciones se
 * llaman desde componentes de servidor.
 *
 * CACHÉ DE 60 SEGUNDOS, que es lo que hace su propio plugin, y no es una optimización:
 * su API contesta **429** si se abusa. Sin caché, cada socio que abre la pantalla del
 * torneo sería una petición suya, y en una ronda con veinte personas mirando eso son
 * veinte por minuto para traer lo mismo. Con `revalidate` es una.
 *
 * NUNCA LANZA. Un torneo que se cae no puede tumbar la pantalla entera: si su API falla,
 * se devuelve null y arriba se enseña el enlace a su página, que es lo que había antes.
 */

const CACHE_SEGUNDOS = 60;

/** El estado de la lectura, para poder decir la verdad en pantalla. */
export type LecturaChessPairings = {
  torneo: TorneoChessPairings | null;
  clasificacion: FilaClasificacion[];
  emparejamientos: MesaEmparejamiento[];
  /** La ronda de la que son esos emparejamientos. */
  ronda: number | null;
  /** Los FIDE ID por inscripción, para cruzar con nuestras fichas. */
  fidePorInscripcion: Map<number, number>;
  /** Qué ha fallado, si algo. `sin-clave` se distingue para poder decirlo. */
  error: "sin-clave" | "no-autorizado" | "no-existe" | "limite" | "red" | null;
};

const VACIO: LecturaChessPairings = {
  torneo: null,
  clasificacion: [],
  emparejamientos: [],
  ronda: null,
  fidePorInscripcion: new Map(),
  error: null,
};

async function pedir(
  ruta: string,
  clave: string
): Promise<{ datos: Record<string, unknown> | null; error: LecturaChessPairings["error"] }> {
  try {
    const r = await fetch(`${BASE_CHESSPAIRINGS}/${ruta}`, {
      headers: {
        authorization: `Bearer ${clave}`,
        accept: "application/json",
        // Se identifica quién llama: es lo cortés con una API ajena y gratuita, y si
        // algún día les molestamos sabrán a quién escribir.
        "user-agent": "FomentoGandiaChess/1.0 (+https://fomento-gandia-chess-swart.vercel.app)",
      },
      next: { revalidate: CACHE_SEGUNDOS },
    });
    if (r.status === 401) return { datos: null, error: "no-autorizado" };
    if (r.status === 404) return { datos: null, error: "no-existe" };
    if (r.status === 429) return { datos: null, error: "limite" };
    if (!r.ok) return { datos: null, error: "red" };
    const datos = (await r.json()) as Record<string, unknown>;
    return { datos, error: null };
  } catch {
    return { datos: null, error: "red" };
  }
}

/**
 * El torneo, su clasificación y los emparejamientos de la ronda en curso.
 *
 * LAS TRES PETICIONES VAN EN PARALELO: son independientes y en serie sumarían tres
 * viajes a Italia por pantalla.
 */
export async function leerTorneoChessPairings(id: number): Promise<LecturaChessPairings> {
  const clave = process.env.CHESSPAIRINGS_API_KEY;
  if (!clave) return { ...VACIO, error: "sin-clave" };

  const [t, c, a, i] = await Promise.all([
    pedir(`torneo/${id}`, clave),
    pedir(`torneo/${id}/classifica`, clave),
    // `ultimo` es la ronda más avanzada que ellos hayan publicado: es lo que se quiere
    // ver al abrir la pantalla, sin tener que elegir número.
    pedir(`torneo/${id}/abbinamenti?turno=ultimo`, clave),
    pedir(`torneo/${id}/iscritti?ordinamento=rating`, clave),
  ]);

  // El error del TORNEO es el que manda: sin él no hay nada que enseñar. Que falle la
  // clasificación de un torneo que sí existe es otra cosa y no debe borrar el resto.
  if (!t.datos) return { ...VACIO, error: t.error ?? "red" };

  return {
    torneo: mapearTorneo(t.datos),
    clasificacion: c.datos ? mapearClasificacion(c.datos) : [],
    emparejamientos: a.datos ? mapearEmparejamientos(a.datos) : [],
    ronda: a.datos && typeof a.datos.turno === "number" ? a.datos.turno : null,
    fidePorInscripcion: i.datos ? fideIdsDeInscritos(i.datos) : new Map(),
    error: null,
  };
}
