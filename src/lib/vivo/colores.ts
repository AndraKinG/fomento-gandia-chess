/**
 * Quién lleva blancas.
 *
 * SON DOS REGLAS DISTINTAS, y confundirlas sería un error de bulto:
 *
 * - **En torneo NO SE DECIDE AQUÍ.** Los colores de un torneo interno los reparte
 *   `src/lib/club/emparejar.ts` al generar la ronda, siguiendo el criterio oficial
 *   —dar blancas a quien menos las lleve, y en la liguilla orientando un circuito
 *   euleriano para que el desequilibrio sea el mínimo posible— y quedan escritos en
 *   `club_pairings`. Una partida en vivo que sale de un emparejamiento COPIA esos
 *   colores tal cual. Volver a tirar la moneda ahí rompería el reparto del torneo.
 *
 * - **En amistosa, esto.** Regla del propietario: el primer encuentro entre dos
 *   socios se sortea, y a partir de ahí se alterna.
 *
 * Módulo puro: la moneda entra por parámetro, que es lo que permite probar el sorteo
 * sin que el resultado dependa de la suerte.
 */

/** Un encuentro anterior entre los dos mismos socios. */
export type Encuentro = { blancasId: string; negrasId: string };

export function blancasEnAmistosa(opciones: {
  retaId: string;
  retadoId: string;
  /** Lo que pidió quien reta. */
  quiere: "blancas" | "negras" | "azar";
  /** El encuentro MÁS RECIENTE entre los dos, o null si no se han visto nunca. */
  ultimo: Encuentro | null;
  /** Número de 0 a 1. Solo se usa si hay que sortear. */
  moneda: number;
}): string {
  const { retaId, retadoId, quiere, ultimo, moneda } = opciones;

  // Si quien reta pide color, manda: el otro acepta el reto sabiéndolo.
  if (quiere === "blancas") return retaId;
  if (quiere === "negras") return retadoId;

  // Alternar solo tiene sentido si el encuentro anterior es de estos dos. Si llega
  // otra cosa se sortea, que es el comportamiento seguro.
  const esDeLosDos =
    ultimo !== null &&
    [ultimo.blancasId, ultimo.negrasId].includes(retaId) &&
    [ultimo.blancasId, ultimo.negrasId].includes(retadoId);

  if (!esDeLosDos) return moneda < 0.5 ? retaId : retadoId;

  // Le tocan blancas a quien llevó negras la última vez.
  return ultimo.blancasId === retaId ? retadoId : retaId;
}
