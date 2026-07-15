import type { ConfigEquipo, ContextoClub, Infraccion, JugadorOrden, TableroPropuesto } from "./tipos";
import { validarNucleo } from "./nucleo";

// Módulo PURO: sin Supabase, sin React, sin I/O (ver nucleo.ts).
//
// Reglas cubiertas (ver docs/referencia/rgc-facv-2018-texto-extraido.txt):
//  - R3 (arts. 51.1/51.4) bloques de titulares por equipo.
//  - R4 (art. 51.5.c)     límites A/B en clubs con equipos en división autonómica.
//  - R5 (art. 51.3)       regla del 50%: aviso preventivo + bloqueo de retorno.
//  - R7 (arts. 54-55)     jugador en dos convocatorias de la misma fecha.
//  - R8 (art. 52.4)       alineaciones conjuntas de equipos en la misma sede.
//
// `orden` es el orden de fuerza COMPLETO del club (todas las categorías, la
// MISMA numeración compartida por todos los equipos: 51.1 define los bloques
// 1-8/9-16/17-24... sobre una única lista, no una por equipo). `alineacion`
// y `config` son los del equipo `ctx.equipoIndice` que se está validando.

/** Clave de comparación de orden de fuerza: (numero, bisIndex) lexicográfico.
 * Duplica la lógica de nucleo.ts (no exportada allí) para mantener contexto.ts
 * desacoplado de los detalles internos de validarNucleo. */
function claveOrden(p: JugadorOrden): [number, number] {
  return [p.numero, p.bisIndex];
}

function compararClave(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

function etiqueta(p: JugadorOrden): string {
  return `${p.nombre} (nº${p.numero}${p.bisIndex > 0 ? `bis${p.bisIndex > 1 ? p.bisIndex : ""}` : ""}, ${p.fuerza})`;
}

function letraEquipo(indice: number): string {
  return String.fromCharCode(65 + indice); // 0 -> 'A', 1 -> 'B', 2 -> 'C'...
}

/** Posición (0-based) de cada jugador en el orden de fuerza del CLUB, ordenado
 * por (numero, bisIndex). Base de los bloques de titulares (R3/R4). */
function calcularIndices(orden: JugadorOrden[]): Map<string, number> {
  const ordenado = [...orden].sort((a, b) => compararClave(claveOrden(a), claveOrden(b)));
  return new Map(ordenado.map((p, i) => [p.playerId, i]));
}

/** Inicio (0-based) del bloque de titulares de cada equipo, acumulando
 * numTablerosPorEquipo (art. 51.4: el tamaño del bloque de un equipo es su
 * propio número de tableros, no siempre 8). */
function calcularInicios(numTablerosPorEquipo: number[]): number[] {
  const inicios: number[] = [];
  let acc = 0;
  for (const n of numTablerosPorEquipo) {
    inicios.push(acc);
    acc += n;
  }
  return inicios;
}

/** Bloque (índice de equipo) al que pertenece la posición `indice`, o null si
 * cae más allá de todos los bloques (bis añadidos al final de la lista,
 * art. 50.1, sin restricción de equipo asociada). */
function bloqueDe(indice: number, numTablerosPorEquipo: number[], inicios: number[]): number | null {
  for (let i = 0; i < numTablerosPorEquipo.length; i++) {
    const inicio = inicios[i];
    const fin = inicio + numTablerosPorEquipo[i];
    if (indice >= inicio && indice < fin) return i;
  }
  return null;
}

/** Filtra la alineación a entradas resolubles (tablero en rango, no
 * duplicado, jugador conocido). Las estructuralmente inválidas ya se
 * reportan en validarNucleo; aquí se ignoran para no contaminar R3-R8. */
function entradasValidas(
  alineacion: TableroPropuesto[],
  config: ConfigEquipo,
  porId: Map<string, JugadorOrden>
): { tablero: number; jugador: JugadorOrden }[] {
  const tablerosVistos = new Set<number>();
  const jugadoresVistos = new Set<string>();
  const validas: { tablero: number; jugador: JugadorOrden }[] = [];
  for (const entrada of alineacion) {
    if (entrada.tablero < 1 || entrada.tablero > config.numTableros) continue;
    if (tablerosVistos.has(entrada.tablero)) continue;
    if (jugadoresVistos.has(entrada.playerId)) continue;
    const jugador = porId.get(entrada.playerId);
    if (!jugador) continue;
    tablerosVistos.add(entrada.tablero);
    jugadoresVistos.add(entrada.playerId);
    validas.push({ tablero: entrada.tablero, jugador });
  }
  return validas;
}

export function validarContexto(
  orden: JugadorOrden[],
  alineacion: TableroPropuesto[],
  config: ConfigEquipo,
  ctx: ContextoClub
): Infraccion[] {
  const infracciones: Infraccion[] = [];
  const porId = new Map(orden.map((p) => [p.playerId, p]));
  const indicePorId = calcularIndices(orden);
  const inicios = calcularInicios(ctx.numTablerosPorEquipo);
  const validas = entradasValidas(alineacion, config, porId);

  // --- R3 (arts. 51.1/51.4): bloques de titulares. -------------------------
  // Un titular de un equipo NUNCA puede alinearse en un equipo de índice
  // MAYOR (categoría inferior); sí puede "subir" a uno de índice menor
  // (categoría superior), para cubrir ausencias de sus titulares (51.1).
  for (const { tablero, jugador } of validas) {
    const idx = indicePorId.get(jugador.playerId);
    if (idx === undefined) continue;
    const bloque = bloqueDe(idx, ctx.numTablerosPorEquipo, inicios);
    if (bloque === null) continue; // bis fuera de bloque: sin restricción.
    if (bloque < ctx.equipoIndice) {
      infracciones.push({
        nivel: "error",
        tablero,
        articulo: "51.1",
        mensaje: `${etiqueta(jugador)} es titular del equipo ${letraEquipo(bloque)} y no puede alinearse en el equipo ${letraEquipo(
          ctx.equipoIndice
        )} (categoría inferior): art. 51.1/51.4.`,
      });
    }
  }

  // --- R4 (art. 51.5.c): límites A/B en clubs de división autonómica. ------
  // Solo aplica si ESTE equipo compite en división autonómica. El límite
  // inferior de B (nº9) ya queda cubierto por R3 (los titulares 1-8 del A no
  // pueden bajar a B), así que aquí solo se comprueba el tope superior.
  if (ctx.esDivisionAutonomica[ctx.equipoIndice]) {
    for (const { tablero, jugador } of validas) {
      const idx = indicePorId.get(jugador.playerId);
      if (idx === undefined) continue;

      if (ctx.equipoIndice === 0 && idx >= 18) {
        infracciones.push({
          nivel: "error",
          tablero,
          articulo: "51.5.c",
          mensaje: `${etiqueta(jugador)} ocupa la posición ${idx + 1} del orden de fuerza del club; el equipo A (división autonómica) solo puede alinear hasta la posición 18 (art. 51.5.c).`,
        });
      } else if (ctx.equipoIndice === 1) {
        const finB = ctx.totalEquipos === 2 ? Infinity : 28;
        if (idx >= finB) {
          infracciones.push({
            nivel: "error",
            tablero,
            articulo: "51.5.c",
            mensaje: `${etiqueta(jugador)} ocupa la posición ${idx + 1} del orden de fuerza del club; el equipo B (división autonómica) solo puede alinear hasta la posición 28 (art. 51.5.c).`,
          });
        }
      }
      // Equipos C y sucesivos (índice >= 2): sin límite (art. 51.5.c in fine).
    }
  }

  // --- R5 (art. 51.3): regla del 50%. --------------------------------------
  // Base: rondas jugadas por el equipo de ORIGEN del titular. Si un titular
  // de equipo inferior, alineado arriba, alcanza o supera el 50% de esas
  // rondas en equipos superiores, se avisa preventivamente (antes de que
  // ocurra) y, una vez alcanzado, queda bloqueado para volver a su equipo
  // de origen (error si se le vuelve a alinear allí).
  for (const { tablero, jugador } of validas) {
    const idx = indicePorId.get(jugador.playerId);
    if (idx === undefined) continue;
    const bloque = bloqueDe(idx, ctx.numTablerosPorEquipo, inicios);
    if (bloque === null) continue;

    const rondasOrigen = ctx.rondasJugadasEquipoOrigen;
    if (rondasOrigen <= 0) continue; // sin base aún, nada que comprobar.
    const veces = ctx.vecesEnSuperior[jugador.playerId] ?? 0;
    const umbral = rondasOrigen * 0.5;

    if (bloque > ctx.equipoIndice) {
      // Titular de un equipo inferior, alineado ahora en un equipo superior.
      if (veces + 1 >= umbral) {
        infracciones.push({
          nivel: "aviso",
          tablero,
          articulo: "51.3",
          mensaje: `${etiqueta(jugador)} alcanzará ${veces + 1} de ${rondasOrigen} rondas (≥ 50%) alineado en equipos superiores si juega esta convocatoria; a partir de entonces ya no podrá volver a alinearse en el equipo ${letraEquipo(bloque)} de origen (art. 51.3).`,
        });
      }
    } else if (bloque === ctx.equipoIndice) {
      // Alineado en su propio equipo de origen: ¿ya está bloqueado?
      if (veces >= umbral) {
        infracciones.push({
          nivel: "error",
          tablero,
          articulo: "51.3",
          mensaje: `${etiqueta(jugador)} ya ha jugado ${veces} de ${rondasOrigen} rondas (≥ 50%) en equipos superiores y no puede volver a alinearse en el equipo ${letraEquipo(bloque)} de origen (art. 51.3).`,
        });
      }
    }
  }

  // --- R7 (arts. 54-55): jugador en dos convocatorias de la misma fecha. ---
  for (const { tablero, jugador } of validas) {
    for (const otra of ctx.alineacionesMismaFecha) {
      if (otra.equipoIndice === ctx.equipoIndice) continue;
      if (otra.playerIds.includes(jugador.playerId)) {
        infracciones.push({
          nivel: "error",
          tablero,
          articulo: "54/55",
          mensaje: `${etiqueta(jugador)} ya consta en la convocatoria del equipo ${letraEquipo(
            otra.equipoIndice
          )} correspondiente a la misma fecha; un jugador no puede constar en dos actas el mismo día (arts. 54 y 55).`,
        });
      }
    }
  }

  // --- R8 (art. 52.4): alineaciones conjuntas de equipos en la misma sede. -
  if (ctx.mismaSede.length > 0) {
    infracciones.push(...validarMismaSede(orden, { equipoIndice: ctx.equipoIndice, alineacion, config }, ctx.mismaSede));
  }

  return infracciones;
}

/** R8 (art. 52.4): concatena las alineaciones de los equipos que juegan en la
 * misma sede (equipo de superior categoría primero) en una alineación
 * virtual única, y aplica R1 (51.2) / R2 (52.3) del núcleo sobre ella, como
 * exige el artículo ("como si se tratase de un solo equipo"). Solo se
 * reenvían las infracciones de orden/margen (51.2/52.3); las estructurales o
 * de borrador del núcleo no aplican aquí (ya se reportan, si procede, al
 * validar cada equipo por separado). */
function validarMismaSede(
  orden: JugadorOrden[],
  actual: { equipoIndice: number; alineacion: TableroPropuesto[]; config: ConfigEquipo },
  mismaSede: ContextoClub["mismaSede"]
): Infraccion[] {
  const participantes = [actual, ...mismaSede].sort((a, b) => a.equipoIndice - b.equipoIndice);

  let offset = 0;
  const combinada: TableroPropuesto[] = [];
  const origenPorTablero = new Map<number, { equipoIndice: number; tableroOriginal: number }>();
  for (const p of participantes) {
    for (const entrada of p.alineacion) {
      const virtual = offset + entrada.tablero;
      combinada.push({ tablero: virtual, playerId: entrada.playerId });
      origenPorTablero.set(virtual, { equipoIndice: p.equipoIndice, tableroOriginal: entrada.tablero });
    }
    offset += p.config.numTableros;
  }

  // Config combinada "más estricta" entre los equipos implicados (decisión
  // de interpretación, documentada en el informe de Task 3):
  //  - margenElo: el MÍNIMO no nulo entre los participantes (más restrictivo
  //    para el check 52.3); null solo si NINGÚN participante tiene margen.
  //  - permitirInversionDentroMargen: permisivo (true) solo si TODOS los
  //    equipos lo son; si alguno es estricto, la combinación es estricta,
  //    para no dejar pasar inversiones que un solo equipo consideraría error.
  const margenes = participantes.map((p) => p.config.margenElo).filter((m): m is number => m !== null);
  const margenCombinado = margenes.length > 0 ? Math.min(...margenes) : null;
  const permisivoCombinado = participantes.every((p) => p.config.permitirInversionDentroMargen);

  const configCombinada: ConfigEquipo = {
    margenElo: margenCombinado,
    numTableros: offset,
    permitirInversionDentroMargen: permisivoCombinado,
  };

  const resultado = validarNucleo(orden, combinada, configCombinada);

  const infracciones: Infraccion[] = [];
  for (const inf of resultado) {
    if (inf.articulo !== "51.2" && inf.articulo !== "52.3") continue;
    const origen = inf.tablero !== null ? origenPorTablero.get(inf.tablero) : undefined;
    const esDeEsteEquipo = origen?.equipoIndice === actual.equipoIndice;
    const equiposImplicados = participantes.map((p) => letraEquipo(p.equipoIndice)).join("+");
    infracciones.push({
      nivel: inf.nivel,
      tablero: esDeEsteEquipo ? origen!.tableroOriginal : null,
      articulo: "52.4",
      mensaje: `${inf.mensaje} [Alineación conjunta misma sede, equipos ${equiposImplicados} — art. 52.4]`,
    });
  }
  return infracciones;
}
