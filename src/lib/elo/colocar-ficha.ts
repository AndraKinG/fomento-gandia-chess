import { fuerza, type ElosJugador } from "@/lib/elo/fuerza";

/**
 * Dónde colocar en el orden de fuerza una ficha creada a mano.
 *
 * PARA QUÉ: quien entra al club a mitad de temporada y **todavía no está federado** no
 * aparece en el orden de fuerza de la FACV en ningún momento, así que la app no lo ve —
 * y la lista de `/vincular` sale de ahí, con lo que ese socio no puede ni vincular su
 * cuenta. La única salida era pegar el orden entero en la importación manual.
 *
 * SE COLOCA POR ELO, que es el criterio del RGC (art. 52.1): detrás del último jugador
 * que sea igual o más fuerte. Es lo mismo que hace la FACV cuando añade a alguien a
 * mitad de temporada: le da un número "bis" junto a uno de fuerza parecida en vez de
 * renumerar la lista entera.
 *
 * UNA FICHA MANUAL NUNCA SE PONE POR DELANTE DE UN NÚMERO YA PUBLICADO. Si resulta ser
 * el más fuerte del club, se queda como "1bis", detrás del número 1. Puede parecer
 * injusto, pero el orden publicado es el que manda en las convocatorias y adelantar a
 * alguien por decisión de la app sería inventarse el reglamento. En cuanto la FACV lo
 * publique, la sincronización semanal lo coloca en su sitio de verdad.
 */

/**
 * Primer `bis_index` de la franja reservada a las fichas manuales.
 *
 * NO ES UN NÚMERO CAPRICHOSO. El parser de la FACV solo produce bis 0 o 1, así que
 * dejando las manuales a partir de 90 no pueden chocar nunca con una posición que la
 * FACV vaya a ocupar. Importa porque la sincronización solo aparta ("cuarentena") las
 * filas que vienen en la página de la FACV: una ficha manual sentada en un `12bis` que
 * la FACV luego asigne a otro haría fallar la sincronización con clave duplicada.
 */
export const BIS_MANUAL_DESDE = 90;

export type FilaOrden = {
  numero: number;
  bisIndex: number;
  eloOficial: number | null;
};

export type Colocacion = { numero: number; bisIndex: number };

/**
 * Posición para una ficha nueva, dado el orden actual de la temporada.
 *
 * `orden` no necesita venir ordenado.
 */
export function colocarFichaManual(
  orden: readonly FilaOrden[],
  elos: ElosJugador
): Colocacion {
  // Con el orden vacío, la ficha abre la lista: no hay ningún número publicado al que
  // no se pueda adelantar.
  if (orden.length === 0) return { numero: 1, bisIndex: 0 };

  const elo = fuerza(elos);
  const porPosicion = [...orden].sort(
    (a, b) => a.numero - b.numero || a.bisIndex - b.bisIndex
  );

  // El último que sea igual o más fuerte. Si no hay ninguno —la ficha es la más
  // fuerte del club— se usa el primer número, y el bis la deja justo detrás.
  const masFuertes = porPosicion.filter((f) => (f.eloOficial ?? 0) >= elo);
  const numero =
    masFuertes.length > 0
      ? masFuertes[masFuertes.length - 1].numero
      : porPosicion[0].numero;

  return { numero, bisIndex: primerBisLibre(orden, numero) };
}

/** Primer hueco de la franja manual para ese número. */
export function primerBisLibre(orden: readonly FilaOrden[], numero: number): number {
  const ocupados = new Set(
    orden.filter((f) => f.numero === numero).map((f) => f.bisIndex)
  );
  let bis = BIS_MANUAL_DESDE;
  while (ocupados.has(bis)) bis++;
  return bis;
}

/** ELO oficial que se guarda con la ficha: el del RGC art. 52.1. */
export function eloOficialDe(elos: ElosJugador): number {
  return fuerza(elos);
}
