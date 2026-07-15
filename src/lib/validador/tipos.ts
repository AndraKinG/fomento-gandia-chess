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
};
