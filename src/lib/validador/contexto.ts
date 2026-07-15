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
 * por (numero, bisIndex). Base de los bloques de titulares (R3/R4).
 * Exportada (Task 4): `contexto-bd.ts` la reutiliza para determinar el
 * equipo de ORIGEN de cada jugador al calcular `vecesEnSuperior` sobre el
 * histórico de jornadas jugadas — evitar una tercera copia de esta lógica
 * en un módulo aparte. */
export function calcularIndices(orden: JugadorOrden[]): Map<string, number> {
  const ordenado = [...orden].sort((a, b) => compararClave(claveOrden(a), claveOrden(b)));
  return new Map(ordenado.map((p, i) => [p.playerId, i]));
}

/** Inicio (0-based) del bloque de titulares de cada equipo, acumulando
 * numTablerosPorEquipo (art. 51.4: el tamaño del bloque de un equipo es su
 * propio número de tableros, no siempre 8). Exportada por el mismo motivo
 * que `calcularIndices` (ver comentario ahí). */
export function calcularInicios(numTablerosPorEquipo: number[]): number[] {
  const inicios: number[] = [];
  let acc = 0;
  for (const n of numTablerosPorEquipo) {
    inicios.push(acc);
    acc += n;
  }
  return inicios;
}

// Finding 5e / minor (e): segunda ambigüedad FACV-confirmable (ver también el
// comentario de `permitirInversionDentroMargen` en tipos.ts). El art. 51.4
// dice que si un equipo juega "a 6" el bloque de titulares es "del 1 al
// 6bis"; el art. 50.1 numera los bis intercalados (p. ej. 1, 1bis, 2, 2bis,
// ..., 6, 6bis). Queda sin confirmar por la FACV si el tamaño del bloque
// (`numTablerosPorEquipo[i]`, usado aquí como cuenta de ENTRADAS/posiciones
// en la lista ordenada) debe interpretarse como "posiciones de la lista
// ordenada que ocupa el bloque" (lectura actual: un bis intercalado cuenta
// como una posición más, desplazando el final del bloque) o como "números
// de orden inclusive hasta 6bis" (lectura alternativa: el bis NO desplaza el
// límite del bloque, ya que "6bis" ya está incluido en "del 1 al 6"). Con la
// lectura actual, un club con un bis intercalado en las primeras 6 plazas
// tendría en realidad 7 ENTRADAS en el bloque del equipo (1..5, 5bis, 6), lo
// cual podría no coincidir con la lectura alternativa. Este módulo asume la
// lectura "cuenta de entradas" (consistente con cómo se define
// `numTablerosPorEquipo` en tipos.ts, ver Task 3); no se ha confirmado (a
// 2026) con la FACV cuál prevalece para casos límite con bis intercalados.
/** Bloque (índice de equipo) al que pertenece la posición `indice`, o null si
 * cae más allá de todos los bloques (bis añadidos al final de la lista,
 * art. 50.1, sin restricción de equipo asociada). Exportada por el mismo
 * motivo que `calcularIndices` (ver comentario ahí). */
export function bloqueDe(indice: number, numTablerosPorEquipo: number[], inicios: number[]): number | null {
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
  //
  // Minor (f): la afirmación anterior ("el límite inferior ya lo cubre R3")
  // presupone que el bloque de titulares del equipo A tiene exactamente 8
  // posiciones (`numTablerosPorEquipo[0] === 8`), que es lo que asume el
  // propio art. 51.5.c al fijar los topes absolutos 18 (A) y 28 (B) — cifras
  // pensadas para una A a 8 tableros. Si un club jugase el A a menos
  // tableros (art. 51.4, p. ej. a 6), R3 seguiría bloqueando correctamente a
  // los titulares REALES del A (bloqueDe ya usa numTablerosPorEquipo, no un
  // 8 fijo) de bajar a B, pero los topes 18/28 aquí abajo seguirían citando
  // los valores textuales del RGC (pensados para A=8) sin reescalarlos: no
  // hay indicación en el RGC de cómo ajustar 18/28 para un A reducido, así
  // que esta implementación no lo intenta y asume división autonómica con
  // A a 8 tableros (caso real esperado en la liga interclubs valenciana).
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

    // Finding 3: rondas del equipo de ORIGEN del titular (su propio bloque,
    // `bloque`), NO del equipo que se está validando (`ctx.equipoIndice`).
    // Antes de este fix, `ContextoClub` solo exponía un escalar
    // (`rondasJugadasEquipoOrigen`) compartido por toda la convocatoria, lo
    // que era incorrecto en cuanto había, en una misma alineación, titulares
    // de MÁS de un equipo de origen distinto jugando arriba (p. ej. un
    // titular de B y otro de C, ambos alineados en el A): cada uno debe
    // medirse contra las rondas de SU propio equipo (B y C pueden llevar
    // disputadas rondas distintas), no contra un valor único.
    const rondasOrigen = ctx.rondasJugadasPorEquipo[bloque] ?? 0;
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
          // Minor (d): "ya no podría volver" (condicional), no "ya no podrá
          // volver" (futuro categórico): este es un AVISO preventivo sobre
          // un estado que aún no se ha alcanzado (se alcanzaría SI se juega
          // esta convocatoria), por lo que la redacción debe seguir siendo
          // válida tanto si el bloqueo ya es un hecho consumado como si es
          // solo la proyección de lo que ocurriría a partir de ahora.
          mensaje: `${etiqueta(jugador)} alcanzará ${veces + 1} de ${rondasOrigen} rondas (≥ 50%) alineado en equipos superiores si juega esta convocatoria; a partir de entonces ya no podría volver a alinearse en el equipo ${letraEquipo(bloque)} de origen (art. 51.3).`,
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
  const porId = new Map(orden.map((p) => [p.playerId, p]));
  const participantes = [actual, ...mismaSede].sort((a, b) => a.equipoIndice - b.equipoIndice);

  let offset = 0;
  const combinada: TableroPropuesto[] = [];
  const origenPorTablero = new Map<number, { equipoIndice: number; tableroOriginal: number }>();
  const equipoPorJugador = new Map<string, number>();
  for (const p of participantes) {
    // Minor (a) / finding 4a: sanear CADA alineación (equipo actual Y los
    // demás de la sede) con la misma pasada de "entradas válidas" que usa
    // nucleo.ts, ANTES de combinar. Sin esto, una entrada fuera de rango o
    // duplicada de un equipo (p. ej. un tablero mal grabado que excede su
    // numTableros real) se desplaza igualmente por `offset` y puede aterrizar
    // en un número de tablero VIRTUAL que sí es válido en la numeración
    // combinada, colisionando con un tablero real de OTRO equipo de la sede
    // (el primero en "ocupar" ese número virtual gana, y el jugador legítimo
    // del segundo equipo se descarta como "repetido"): eso enmascararía una
    // infracción cruzada real. Al sanear por participante primero, la entrada
    // corrupta nunca entra en `combinada`.
    const validasParticipante = entradasValidas(p.alineacion, p.config, porId);
    for (const { tablero, jugador } of validasParticipante) {
      const virtual = offset + tablero;
      combinada.push({ tablero: virtual, playerId: jugador.playerId });
      origenPorTablero.set(virtual, { equipoIndice: p.equipoIndice, tableroOriginal: tablero });
      equipoPorJugador.set(jugador.playerId, p.equipoIndice);
    }
    offset += p.config.numTableros;
  }

  // Config combinada (Fix round 1, finding 1: corrige la combinación previa,
  // que era MÁS PERMISIVA que un participante con margen null):
  //  - margenElo: null si CUALQUIER participante tiene margenElo === null
  //    (ese equipo no tiene margen aplicable en absoluto — art. 52.3.c — y
  //    para él rige el 51.2 puro, orden estricto sin excepción; combinar con
  //    un margen numérico de otro equipo dejaría pasar como "inversión
  //    legal" una infracción que, para el equipo sin margen, sería un error
  //    51.2 sin paliativos). Si NINGÚN participante tiene margenElo null, se
  //    usa el MÍNIMO de los margenes (el más restrictivo para el check
  //    52.3).
  //  - permitirInversionDentroMargen: permisivo (true) solo si TODOS los
  //    equipos lo son; si alguno es estricto, la combinación es estricta,
  //    para no dejar pasar inversiones que un solo equipo consideraría error.
  const algunSinMargen = participantes.some((p) => p.config.margenElo === null);
  const margenesNoNulos = participantes.map((p) => p.config.margenElo).filter((m): m is number => m !== null);
  const margenCombinado = algunSinMargen ? null : Math.min(...margenesNoNulos);
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

    // Finding 2: si NINGUNO de los jugadores implicados en la infracción
    // pertenece al equipo que se está validando, es una infracción interna
    // de OTRO equipo de la sede (p. ej. el propio equipo A invertido consigo
    // mismo). El art. 52.4 dice explícitamente que "las sanciones solo le
    // afectan al equipo que ha cometido las infracciones": no se debe
    // reenviar como error bloqueante a un equipo ajeno a la infracción, solo
    // como aviso informativo (para que su capitán sepa que hay un problema
    // en la sede, sin que le impida validar su propia alineación).
    const playerIds = inf.playerIds ?? [];
    const afectaAlEquipoActual = playerIds.some((id) => equipoPorJugador.get(id) === actual.equipoIndice);
    const esInfraccionAjena = playerIds.length > 0 && !afectaAlEquipoActual;

    const equipoResponsable = origen ? letraEquipo(origen.equipoIndice) : equiposImplicados;
    const mensaje = esInfraccionAjena
      ? `(equipo ${equipoResponsable} de la sede) ${inf.mensaje} [Alineación conjunta misma sede, equipos ${equiposImplicados} — art. 52.4]`
      : `${inf.mensaje} [Alineación conjunta misma sede, equipos ${equiposImplicados} — art. 52.4]`;

    infracciones.push({
      nivel: esInfraccionAjena ? "aviso" : inf.nivel,
      tablero: esDeEsteEquipo ? origen!.tableroOriginal : null,
      articulo: "52.4",
      mensaje,
      ...(inf.playerIds ? { playerIds: inf.playerIds } : {}),
    });
  }
  return infracciones;
}
