/**
 * Reglas de los coches para ir a un torneo.
 *
 * Módulo PURO: sin base de datos, sin red y sin UI, igual que
 * `src/lib/validador/`. Las funciones de efectos devuelven la lista de cambios
 * y de avisos **sin ejecutarlos**, de modo que las reglas se pueden testear
 * enteras sin montar nada. Las server actions son el envoltorio que las aplica.
 *
 * Vocabulario de asistencia idéntico al de la disponibilidad de Interclubs
 * (`voy` / `no_voy` / `duda`, sin fila = sin responder) para que el socio
 * reconozca el gesto y se pueda reutilizar `BotonesDisponibilidad`.
 */

export type Asistencia = "voy" | "no_voy" | "duda";

export type Coche = {
  id: string;
  conductorId: string;
  /** Plazas PARA PASAJEROS: el conductor no ocupa una de las suyas. */
  plazas: number;
  horaSalida?: string | null;
  puntoSalida?: string | null;
};

export type Asiento = { cocheId: string; playerId: string };

/** Asistencia declarada por jugador. Sin entrada = no ha respondido. */
export type Asistencias = Record<string, Asistencia | undefined>;

export type Estado = {
  coches: Coche[];
  asientos: Asiento[];
  asistencias: Asistencias;
};

/** Motivo por el que alguien no puede coger plaza, para poder explicárselo. */
export type MotivoRechazo =
  | "coche_lleno"
  | "ya_va_en_otro_coche"
  | "es_el_conductor_de_este"
  | "es_conductor_de_otro"
  | "coche_inexistente";

export type Cambio =
  | { tipo: "asistencia"; playerId: string; estado: Asistencia }
  | { tipo: "ocupar_plaza"; cocheId: string; playerId: string }
  | { tipo: "liberar_plaza"; cocheId: string; playerId: string }
  | { tipo: "borrar_coche"; cocheId: string };

export type Aviso =
  | { tipo: "plaza_liberada"; destinatarioId: string; pasajeroId: string }
  | { tipo: "te_quedas_sin_coche"; destinatarioId: string; cocheId: string };

export type Efectos = { cambios: Cambio[]; avisos: Aviso[] };

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function ocupadas(cocheId: string, asientos: Asiento[]): number {
  return asientos.filter((a) => a.cocheId === cocheId).length;
}

/** Plazas libres de un coche. Nunca negativo, aunque los datos vinieran mal. */
export function plazasLibres(coche: Coche, asientos: Asiento[]): number {
  return Math.max(0, coche.plazas - ocupadas(coche.id, asientos));
}

/** Coche en el que viaja alguien como pasajero, si va en alguno. */
export function cocheDePasajero(playerId: string, estado: Estado): Coche | null {
  const asiento = estado.asientos.find((a) => a.playerId === playerId);
  if (!asiento) return null;
  return estado.coches.find((c) => c.id === asiento.cocheId) ?? null;
}

export function esConductor(playerId: string, estado: Estado): boolean {
  return estado.coches.some((c) => c.conductorId === playerId);
}

/**
 * ¿Puede este socio coger plaza en este coche? Devuelve el motivo cuando no,
 * para que la interfaz explique por qué en vez de deshabilitar un botón a secas.
 *
 * NO exige que el socio haya dicho que va: apuntarse a un coche ES decir que
 * vas (ver `efectosDeApuntarse`). Pedir las dos cosas obligaría a dos gestos
 * para una sola intención.
 */
export function puedeApuntarse(
  playerId: string,
  cocheId: string,
  estado: Estado
): { puede: true } | { puede: false; motivo: MotivoRechazo } {
  const coche = estado.coches.find((c) => c.id === cocheId);
  if (!coche) return { puede: false, motivo: "coche_inexistente" };
  if (coche.conductorId === playerId)
    return { puede: false, motivo: "es_el_conductor_de_este" };
  if (esConductor(playerId, estado))
    return { puede: false, motivo: "es_conductor_de_otro" };
  if (cocheDePasajero(playerId, estado))
    return { puede: false, motivo: "ya_va_en_otro_coche" };
  if (plazasLibres(coche, estado.asientos) <= 0)
    return { puede: false, motivo: "coche_lleno" };
  return { puede: true };
}

// ---------------------------------------------------------------------------
// Efectos
// ---------------------------------------------------------------------------

/**
 * Regla 2 de la spec: **apuntarse a un coche implica ir al torneo**. Si el socio
 * no había respondido o había dicho que no, su asistencia pasa a `voy`; sería
 * absurdo tener un pasajero que "no va". Si ya había dicho `voy`, no se toca.
 *
 * Un `duda` también pasa a `voy`: coger sitio en un coche concreto es un
 * compromiso más firme que la duda.
 */
export function efectosDeApuntarse(
  playerId: string,
  cocheId: string,
  estado: Estado
): Efectos {
  const permiso = puedeApuntarse(playerId, cocheId, estado);
  if (!permiso.puede) return { cambios: [], avisos: [] };

  const cambios: Cambio[] = [{ tipo: "ocupar_plaza", cocheId, playerId }];
  if (estado.asistencias[playerId] !== "voy") {
    cambios.push({ tipo: "asistencia", playerId, estado: "voy" });
  }
  return { cambios, avisos: [] };
}

/** Bajarse voluntariamente de un coche. No cambia la asistencia al torneo. */
export function efectosDeBajarse(playerId: string, estado: Estado): Efectos {
  const coche = cocheDePasajero(playerId, estado);
  if (!coche) return { cambios: [], avisos: [] };
  return {
    cambios: [{ tipo: "liberar_plaza", cocheId: coche.id, playerId }],
    avisos: [
      { tipo: "plaza_liberada", destinatarioId: coche.conductorId, pasajeroId: playerId },
    ],
  };
}

/**
 * Regla 3: **pasar a `no_voy` libera la plaza** y avisa al conductor. Sin esto,
 * los coches acumulan plazas ocupadas por gente que ya dijo que no viene, que es
 * exactamente el problema que tiene hoy el club en WhatsApp.
 *
 * `duda` NO libera la plaza: quien duda pero tiene sitio reservado sigue
 * contando, y es el conductor quien decide si espera.
 */
export function efectosDeCambiarAsistencia(
  playerId: string,
  nueva: Asistencia,
  estado: Estado
): Efectos {
  const cambios: Cambio[] = [{ tipo: "asistencia", playerId, estado: nueva }];
  const avisos: Aviso[] = [];

  if (nueva === "no_voy") {
    const coche = cocheDePasajero(playerId, estado);
    if (coche) {
      cambios.push({ tipo: "liberar_plaza", cocheId: coche.id, playerId });
      avisos.push({
        tipo: "plaza_liberada",
        destinatarioId: coche.conductorId,
        pasajeroId: playerId,
      });
    }
  }

  return { cambios, avisos };
}

/**
 * Regla 5: al borrar un coche sus pasajeros se quedan sin plaza y reciben aviso,
 * pero **su asistencia al torneo no se toca**: querer ir sigue siendo verdad
 * aunque te hayas quedado sin transporte, y borrarla les obligaría a volver a
 * declararla.
 */
export function efectosDeBorrarCoche(cocheId: string, estado: Estado): Efectos {
  const coche = estado.coches.find((c) => c.id === cocheId);
  if (!coche) return { cambios: [], avisos: [] };

  const pasajeros = estado.asientos
    .filter((a) => a.cocheId === cocheId)
    .map((a) => a.playerId);

  return {
    // Basta borrar el coche: los asientos caen con él en cascada (FK), pero se
    // listan explícitamente para que quien aplique los efectos sepa a quién
    // afecta sin volver a consultar.
    cambios: [
      ...pasajeros.map(
        (playerId): Cambio => ({ tipo: "liberar_plaza", cocheId, playerId })
      ),
      { tipo: "borrar_coche", cocheId },
    ],
    avisos: pasajeros.map(
      (playerId): Aviso => ({
        tipo: "te_quedas_sin_coche",
        destinatarioId: playerId,
        cocheId,
      })
    ),
  };
}

/**
 * Regla 1: no se puede bajar `plazas` por debajo de las ya ocupadas. La
 * comprobación se repite en un trigger de base de datos (migración 0010),
 * porque entre leer y escribir cabe otra petición; esto es para dar un mensaje
 * decente antes de intentarlo.
 */
export function puedeCambiarPlazas(
  cocheId: string,
  nuevasPlazas: number,
  estado: Estado
):
  | { puede: true }
  // Se distinguen los dos motivos porque dan mensajes distintos: "un coche
  // tiene que ofrecer al menos una plaza" no es lo mismo que "ya llevas 3
  // pasajeros". Devolver solo `ocupadas` haría decir "no puedes bajar de 0
  // ocupadas" a quien escribió un 0.
  | { puede: false; motivo: "minimo_una_plaza"; ocupadas: number }
  | { puede: false; motivo: "hay_mas_ocupadas"; ocupadas: number } {
  const ocup = ocupadas(cocheId, estado.asientos);
  if (!Number.isInteger(nuevasPlazas) || nuevasPlazas < 1)
    return { puede: false, motivo: "minimo_una_plaza", ocupadas: ocup };
  if (nuevasPlazas < ocup)
    return { puede: false, motivo: "hay_mas_ocupadas", ocupadas: ocup };
  return { puede: true };
}

// ---------------------------------------------------------------------------
// Resumen para el admin
// ---------------------------------------------------------------------------

export type ResumenTransporte = {
  /** Quienes han dicho `voy` o `duda` y no tienen plaza ni conducen. */
  sinPlaza: string[];
  plazasLibres: number;
  /** Faltan sitios para todos los que quieren ir. */
  faltanPlazas: boolean;
};

/**
 * Lo que el admin necesita ver de un vistazo para saber si hace falta otro
 * coche. Cuenta a los que dudan como gente a transportar: es más barato llevar
 * un asiento vacío que dejar a alguien tirado.
 */
export function resumenTransporte(estado: Estado): ResumenTransporte {
  const quierenIr = Object.entries(estado.asistencias)
    .filter(([, e]) => e === "voy" || e === "duda")
    .map(([playerId]) => playerId);

  const sinPlaza = quierenIr.filter(
    (p) => !cocheDePasajero(p, estado) && !esConductor(p, estado)
  );
  const libres = estado.coches.reduce(
    (total, c) => total + plazasLibres(c, estado.asientos),
    0
  );

  return { sinPlaza, plazasLibres: libres, faltanPlazas: sinPlaza.length > libres };
}
