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
