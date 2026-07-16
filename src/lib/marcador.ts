// Módulo PURO (sin I/O): cálculo del marcador de una jornada a partir de los
// resultados por tablero (`board_results.resultado`), que siempre se guardan
// desde el punto de vista de ESTE club (ver comentario en
// supabase/migrations/0005_convocatorias.sql, tabla board_results: 1 = gana
// nuestro jugador, 0.5 = tablas, 0 = pierde).
//
// Decisión de formato (Task 7): el marcador se muestra SIEMPRE como
// "nuestro – rival", con nuestro resultado primero, sin importar si el
// encuentro es en casa o fuera (`es_local`). Alternar el orden según
// es_local (como hace chess-results con "local – visitante") confundiría al
// capitán/jugador que consulta su propia jornada: su resultado estaría a
// veces a la izquierda, a veces a la derecha. `es_local` sigue controlando
// otras cosas en pantalla (p. ej. "vs" / "@", quién es local en el chip de
// color de cada tablero — ver `colores.ts`), pero no el orden del marcador.

export type Marcador = {
  nuestro: number;
  rival: number;
  completos: number; // nº de tableros con resultado ya guardado
  total: number; // nº de tableros de la convocatoria
  texto: string; // "4½ – 3½"
};

/** Formatea un resultado/suma en notación ajedrecística: "4½", "3", "½", "0". */
export function formatearPunto(n: number): string {
  const entero = Math.floor(n + 1e-9);
  const tieneMedio = Math.abs(n - entero - 0.5) < 1e-9;
  if (!tieneMedio) return String(entero);
  return entero === 0 ? "½" : `${entero}½`;
}

/**
 * `resultados`: SOLO los tableros que ya tienen resultado guardado (desde el
 * punto de vista de nuestro jugador). `total`: nº de tableros de la
 * convocatoria publicada, para poder mostrar un marcador parcial
 * ("completos/total") mientras el capitán sigue anotando.
 */
export function calcularMarcador(resultados: number[], total: number): Marcador {
  const nuestro = resultados.reduce((acc, r) => acc + r, 0);
  const completos = resultados.length;
  const rival = completos - nuestro;
  return {
    nuestro,
    rival,
    completos,
    total,
    texto: `${formatearPunto(nuestro)} – ${formatearPunto(rival)}`,
  };
}

export type MarcadorPreferidoInput = {
  /** Marcador calculado a partir de `board_results` (ver `calcularMarcador`),
   * si hay convocatoria publicada. `undefined`/`null` si no hay convocatoria
   * (nada que anotar por tablero todavía). */
  boardsMarcador?: Marcador | null;
  /** `matches.marcador_propio`/`marcador_rival`: solo los rellena la sync
   * FACV (Task 8, Fase 1C) cuando el capitán NO ha anotado nada por tablero. */
  marcadorPropio?: number | null;
  marcadorRival?: number | null;
};

export type MarcadorPreferidoResultado = {
  texto: string;
  /** true si el marcador viene de tableros pero AÚN quedan tableros sin
   * resultado (completos < total): quien lo muestre puede señalarlo. */
  parcial: boolean;
  fuente: "tableros" | "facv";
};

/**
 * Revisión final 1C, item 3: precedencia ÚNICA del marcador de una jornada,
 * compartida por `/equipos/[id]` (lista de jornadas) y `/jornadas/[matchId]`
 * (detalle) — antes cada pantalla decidía por su cuenta y la de
 * `/equipos/[id]` tenía la precedencia INVERTIDA (mostraba el marcador de la
 * sync FACV con prioridad sobre los resultados por tablero del capitán,
 * pudiendo mostrar un marcador desactualizado si el capitán ya había
 * corregido algo por tablero).
 *
 * Regla ("boards del capitán primero"): en cuanto haya AL MENOS un resultado
 * por tablero anotado (aunque la convocatoria no esté completa todavía), ese
 * es el marcador que se muestra — es el dato más fino y más actual, y
 * `decidirEncuentro` (facv-resultados-apply.ts) ya nunca pisa estos datos.
 * El marcador global de FACV (`marcadorPropio`/`marcadorRival`) solo se usa
 * como *fallback* cuando no hay NINGÚN resultado por tablero todavía.
 */
export function marcadorPreferido({
  boardsMarcador,
  marcadorPropio,
  marcadorRival,
}: MarcadorPreferidoInput): MarcadorPreferidoResultado | null {
  if (boardsMarcador && boardsMarcador.completos > 0) {
    return {
      texto: boardsMarcador.texto,
      parcial: boardsMarcador.completos < boardsMarcador.total,
      fuente: "tableros",
    };
  }
  if (marcadorPropio !== null && marcadorPropio !== undefined && marcadorRival !== null && marcadorRival !== undefined) {
    return {
      texto: `${formatearPunto(marcadorPropio)} – ${formatearPunto(marcadorRival)}`,
      parcial: false,
      fuente: "facv",
    };
  }
  return null;
}
