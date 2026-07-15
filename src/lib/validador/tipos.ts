// Contrato compartido con Tasks 3-5. NO renombrar campos: otros módulos
// (validador de contexto, actions, editor en vivo) importan estos tipos.

export type JugadorOrden = {
  playerId: string;
  nombre: string;
  numero: number; // posición en el orden de fuerza
  bisIndex: number; // 0 = titular, 1 = bis
  fuerza: number; // elo_oficial ?? fuerza(elos) — resuelto ANTES de llamar al validador
  excepcionMargen: boolean; // tecnificación o +75 autorizado (arts. 52.3.d-e)
};

export type TableroPropuesto = { tablero: number; playerId: string };

export type Infraccion = {
  nivel: "error" | "aviso";
  tablero: number | null; // null = infracción global
  articulo: string; // "51.2", "52.3", "50.3", ...
  mensaje: string; // español, cita nombres y números concretos
  // OPCIONAL (finding 2, Fix round 1): playerIds de los jugadores implicados
  // en la infracción (los dos de una pareja 51.2/52.3, o el único de una
  // infracción individual). Campo opcional y no rompe compatibilidad con
  // código existente que construye Infraccion sin él; su propósito es
  // permitir a validarMismaSede (contexto.ts, R8/52.4) distinguir una
  // infracción puramente interna de OTRO equipo de la sede (ninguno de los
  // playerIds pertenece al equipo que se está validando) de una infracción
  // cruzada genuina (al menos un jugador es del equipo validado), ya que el
  // art. 52.4 dice explícitamente que "las sanciones solo le afectan al
  // equipo que ha cometido las infracciones".
  playerIds?: string[];
};

export type ConfigEquipo = {
  margenElo: number | null; // 100 | 200 | null (sin margen)
  numTableros: number; // 8 | 4
  // El RGC es AMBIGUO entre el art. 51.2 ("nunca" un jugador detrás de otro
  // con mejor orden de fuerza, sin excepción textual) y el art. 52.3 (que
  // solo prohíbe superar el margen ELO, dejando implícito -a contrario- que
  // una inversión de orden POR DEBAJO del margen sería tolerada). La FACV
  // no ha confirmado (a 2026) cuál lectura prevalece para las ligas reales;
  // por eso este campo es OBLIGATORIO (no opcional, sin valor por defecto
  // implícito): cada club/temporada debe decidir conscientemente qué
  // interpretación aplicar hasta que la FACV lo aclare.
  //   - false → ESTRICTO (lectura sin riesgo, recomendada mientras no haya
  //     confirmación de la FACV): CUALQUIER inversión de orden es error
  //     51.2, exista o no margen de ELO configurado; Y ADEMÁS se aplica el
  //     check de parejas del 52.3 (ambos artículos se exigen a la vez).
  //   - true → PERMISIVO (comportamiento histórico de este módulo, lectura
  //     "a contrario" del 52.3): con margen configurado, una inversión con
  //     diferencia de ELO < margen es solo un aviso ("inversión legal");
  //     si la diferencia ≥ margen, error 52.3. El 51.2 puro solo se exige
  //     cuando no hay margen aplicable (art. 52.3.c).
  permitirInversionDentroMargen: boolean;
};

// --- Task 3: contexto del club (arts. 51.1, 51.3, 51.4, 51.5.c, 52.4, 54-55) ---
// Contrato compartido con Tasks 4-6 (contexto BD, actions, editor en vivo).
// NO renombrar campos existentes.
export type ContextoClub = {
  equipoIndice: number; // 0 = A, 1 = B, 2 = C... (orden por categoría, A = superior)
  totalEquipos: number;
  numTablerosPorEquipo: number[]; // tableros de CADA equipo, en orden de categoría (art. 51.4)
  esDivisionAutonomica: boolean[]; // por equipo, para límites del art. 51.5.c
  alineacionesMismaFecha: { equipoIndice: number; playerIds: string[] }[]; // arts. 54-55
  // art. 52.4: equipos del club que juegan en la MISMA sede esa jornada.
  // Decisión de interpretación (Task 3, ver informe): el boceto del brief
  // definía este campo como `number[]` (solo índices de equipo). Se amplía
  // a incluir la alineación propuesta y la ConfigEquipo de cada equipo,
  // porque el art. 52.4 exige "confeccionar las alineaciones... como si se
  // tratase de un solo equipo": sin los tableros propuestos y la config
  // (margenElo, numTableros) del otro equipo es imposible reconstruir esa
  // alineación conjunta y aplicar R1/R2 sobre ella. El orden de fuerza es
  // el mismo `orden` (club-wide) que se pasa a validarContexto, por lo que
  // no se duplica aquí.
  mismaSede: { equipoIndice: number; alineacion: TableroPropuesto[]; config: ConfigEquipo }[];
  vecesEnSuperior: Record<string, number>; // playerId -> nº de rondas alineado en equipos superiores (art. 51.3)
  // Finding 3 (Fix round 1): reemplaza el antiguo `rondasJugadasEquipoOrigen:
  // number` (un único escalar). El art. 51.3 exige contar, para CADA
  // titular, las rondas de SU PROPIO equipo de origen (el bloque de
  // titulares al que pertenece según el orden de fuerza y
  // numTablerosPorEquipo), no las del equipo que se está validando: en una
  // misma alineación puede haber un titular del equipo B jugando arriba (en
  // el A) y, en la MISMA convocatoria del A, un titular del C jugando arriba
  // también, cada uno con su propio nº de rondas de origen (B y C pueden
  // llevar disputadas rondas distintas). Indexado por equipoIndice (mismo
  // orden que numTablerosPorEquipo/esDivisionAutonomica).
  rondasJugadasPorEquipo: number[];
};
