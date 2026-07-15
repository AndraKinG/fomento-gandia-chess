import type { ConfigEquipo, Infraccion, JugadorOrden, TableroPropuesto } from "./tipos";

// Módulo PURO: sin Supabase, sin React, sin I/O. Debe poder ejecutarse tanto
// en el navegador (editor en vivo) como en el servidor (actions, cron).
//
// Reglas cubiertas (ver docs/referencia/rgc-facv-2018-texto-extraido.txt):
//  - art. 51.2  orden de fuerza estricto (con margenElo === null).
//  - art. 52.3  margen de ELO (División de Honor 100 / 1ª-2ª autonómica 200).
//  - art. 50.3  máximo 2 bises alineados por encuentro.
//  - Reglas estructurales de integridad de datos (sin cita de artículo:
//    no son "alineación indebida" en sí, son errores de formulario que
//    impiden siquiera evaluar el resto de reglas).

/** Clave de comparación de orden de fuerza: (numero, bisIndex) lexicográfico. */
function claveOrden(p: JugadorOrden): [number, number] {
  return [p.numero, p.bisIndex];
}

function compararClave(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

function etiqueta(p: JugadorOrden): string {
  return `${p.nombre} (nº${p.numero}${p.bisIndex > 0 ? `bis${p.bisIndex > 1 ? p.bisIndex : ""}` : ""}, ${p.fuerza})`;
}

/** Error 51.2: "detrás" no puede ir por detrás de "delante" (peor orden de fuerza). */
function error512(
  detras: { tablero: number; jugador: JugadorOrden },
  delante: { tablero: number; jugador: JugadorOrden }
): Infraccion {
  return {
    nivel: "error",
    tablero: detras.tablero,
    articulo: "51.2",
    mensaje: `${etiqueta(detras.jugador)} no puede ir en el tablero ${detras.tablero}, por detrás de ${etiqueta(
      delante.jugador
    )} en el tablero ${delante.tablero}: tiene mejor orden de fuerza (art. 51.2).`,
    // Finding 2: ambos jugadores de la pareja infractora, para que
    // validarMismaSede (contexto.ts) pueda distinguir una infracción interna
    // de OTRO equipo de una infracción cruzada real.
    playerIds: [detras.jugador.playerId, delante.jugador.playerId],
  };
}

export function validarNucleo(
  orden: JugadorOrden[],
  alineacion: TableroPropuesto[],
  config: ConfigEquipo
): Infraccion[] {
  const infracciones: Infraccion[] = [];
  const porId = new Map(orden.map((p) => [p.playerId, p]));

  // --- 1. Validaciones estructurales de la propia alineación ---------------
  // Estas no citan artículo RGC: son inconsistencias de datos (el formulario
  // no debería ni permitir guardarlas), no la infracción sustantiva del
  // art. 56. Se filtran de las comprobaciones siguientes para no arrastrar
  // datos inválidos (tablero duplicado, jugador duplicado, fuera de rango,
  // jugador desconocido) al análisis de orden/margen/bises.
  const tablerosVistos = new Set<number>();
  const jugadoresVistos = new Set<string>();
  const validas: { tablero: number; jugador: JugadorOrden }[] = [];

  for (const entrada of alineacion) {
    // El chequeo de rango va ANTES que el de duplicados (finding 5a): un
    // tablero fuera de rango nunca debe "consumirse" en tablerosVistos, para
    // que una segunda aparición del mismo número fuera de rango se reporte
    // también como "fuera de rango" y no como "repetido" (el problema real
    // es el rango, no la repetición).
    if (entrada.tablero < 1 || entrada.tablero > config.numTableros) {
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El tablero ${entrada.tablero} está fuera del rango 1..${config.numTableros} del equipo.`,
        playerIds: [entrada.playerId],
      });
      continue;
    }

    if (tablerosVistos.has(entrada.tablero)) {
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El tablero ${entrada.tablero} está repetido en la alineación.`,
        playerIds: [entrada.playerId],
      });
      continue;
    }
    tablerosVistos.add(entrada.tablero);

    if (jugadoresVistos.has(entrada.playerId)) {
      // Finding 5b: citar el NOMBRE del jugador (resoluble vía el orden de
      // fuerza), no el playerId crudo, para que el mensaje sea legible.
      const conocido = porId.get(entrada.playerId);
      const nombre = conocido ? conocido.nombre : entrada.playerId;
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El jugador ${nombre} está alineado en más de un tablero.`,
        playerIds: [entrada.playerId],
      });
      continue;
    }

    const jugador = porId.get(entrada.playerId);
    if (!jugador) {
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El jugador ${entrada.playerId} no está en el orden de fuerza del club.`,
        playerIds: [entrada.playerId],
      });
      continue;
    }

    jugadoresVistos.add(entrada.playerId);
    validas.push({ tablero: entrada.tablero, jugador });
  }

  validas.sort((a, b) => a.tablero - b.tablero);

  // --- 2. Alineación incompleta / tableros vacíos (art. 50.3/51.4 exigen
  // completar la plantilla, pero un borrador guardado a medias no puede
  // generar error: solo aviso informativo). ------------------------------
  const ocupados = new Set(validas.map((v) => v.tablero));
  for (let tab = 1; tab <= config.numTableros; tab++) {
    if (!ocupados.has(tab)) {
      infracciones.push({
        nivel: "aviso",
        tablero: tab,
        articulo: "borrador",
        mensaje: `El tablero ${tab} está vacío (alineación incompleta).`,
      });
    }
  }

  // --- 3. R6 (art. 50.3): máximo 2 bises alineados por encuentro. ----------
  const bisesAlineados = validas.filter((v) => v.jugador.bisIndex > 0);
  if (bisesAlineados.length > 2) {
    infracciones.push({
      nivel: "error",
      tablero: null,
      articulo: "50.3",
      mensaje: `Se alinean ${bisesAlineados.length} bises (${bisesAlineados
        .map((v) => etiqueta(v.jugador))
        .join(", ")}); el máximo permitido por encuentro es 2 (art. 50.3).`,
      playerIds: bisesAlineados.map((v) => v.jugador.playerId),
    });
  }

  // --- 4. R1 (art. 51.2) y R2 (art. 52.3): comparar TODAS las parejas de
  // tableros ocupados (i < j), no solo adyacentes. --------------------------
  const margen = config.margenElo;
  // Finding 1 (decisión del club, campo obligatorio: ver comentario en
  // tipos.ts): el RGC es ambiguo entre el 51.2 ("nunca" inversión) y el
  // 52.3 (margen ELO, que "a contrario" toleraría inversiones pequeñas).
  //   - estricto = true  → CUALQUIER inversión de orden es error 51.2,
  //     exista o no margen; el check de parejas 52.3 se aplica IGUALMENTE
  //     (ambos artículos se exigen a la vez).
  //   - estricto = false → semántica histórica: con margen, una inversión
  //     con diferencia < margen es solo aviso "inversión legal".
  const estricto = margen !== null && !config.permitirInversionDentroMargen;

  // Finding 4: los avisos "inversión legal" (dif < margen, modo permisivo)
  // se deduplican agrupando por el jugador que va delante con peor orden
  // real, para no emitir un aviso por cada pareja afectada (hasta 28 en una
  // alineación muy reordenada). Los errores (51.2 y 52.3) y los avisos
  // informativos por excepción de margen SIGUEN siendo por pareja: solo se
  // agrupa la categoría "inversión legal".
  const inversionesLegalesPorDelante = new Map<
    string,
    {
      delante: JugadorOrden;
      tableroDelante: number;
      detrasList: { jugador: JugadorOrden; tablero: number; diferencia: number }[];
    }
  >();

  for (let a = 0; a < validas.length; a++) {
    for (let b = a + 1; b < validas.length; b++) {
      const delante = validas[a]; // tablero menor = "delante"
      const detras = validas[b]; // tablero mayor = "detrás"

      const claveDelante = claveOrden(delante.jugador);
      const claveDetras = claveOrden(detras.jugador);
      const esInversionOrden = compararClave(claveDelante, claveDetras) > 0;

      if (margen === null) {
        // Sin margen de ELO aplicable (art. 52.3.c): manda estrictamente el
        // orden de fuerza (numero, bisIndex), no la fuerza (ELO). Un empate
        // de fuerza NO exime de respetar el orden (test 12).
        if (esInversionOrden) {
          infracciones.push(error512(detras, delante));
        }
        continue;
      }

      // R1 en modo ESTRICTO: la inversión de orden es SIEMPRE error 51.2,
      // con independencia del resultado del check de margen de abajo (que
      // se evalúa a continuación de todos modos: ambos artículos aplican).
      // El 51.2 no admite excepción textual (a diferencia del 52.3.d-e).
      if (estricto && esInversionOrden) {
        infracciones.push(error512(detras, delante));
      }

      // Con margen (art. 52.3): "un jugador no esté por delante de otro que
      // le supere en M puntos ELO o más". El texto no condiciona esto a que
      // haya inversión de orden: se compara SIEMPRE fuerza(detrás) vs
      // fuerza(delante) para cualquier pareja de tableros. Por eso el check
      // de margen es independiente del check de inversión de orden.
      const diferencia = detras.jugador.fuerza - delante.jugador.fuerza;

      if (diferencia >= margen) {
        // Finding 2: la excepción de margen (arts. 52.3.d-e, tecnificación o
        // +75 años) suprime el error si CUALQUIERA de los dos jugadores de
        // la pareja la tiene concedida — no solo el de delante. En la
        // práctica, el veterano +75 (que suele ser el jugador FUERTE) se
        // ubica deliberadamente BAJO en el orden de fuerza, es decir, es
        // habitualmente el jugador de "detrás" en la pareja infractora.
        const excepcionDelante = delante.jugador.excepcionMargen;
        const excepcionDetras = detras.jugador.excepcionMargen;
        if (excepcionDelante || excepcionDetras) {
          const quienes =
            excepcionDelante && excepcionDetras
              ? `${delante.jugador.nombre} y ${detras.jugador.nombre} tienen`
              : excepcionDelante
                ? `${delante.jugador.nombre} tiene`
                : `${detras.jugador.nombre} tiene`;
          infracciones.push({
            nivel: "aviso",
            tablero: detras.tablero,
            articulo: "52.3",
            mensaje: `${etiqueta(detras.jugador)} supera a ${etiqueta(
              delante.jugador
            )} en ${diferencia} ≥ ${margen}, pero ${quienes} excepción de margen autorizada (arts. 52.3.d-e).`,
            playerIds: [detras.jugador.playerId, delante.jugador.playerId],
          });
        } else {
          infracciones.push({
            nivel: "error",
            tablero: detras.tablero,
            articulo: "52.3",
            mensaje: `${etiqueta(delante.jugador)} no puede ir por delante de ${etiqueta(
              detras.jugador
            )} en el tablero ${detras.tablero}: le supera en ${diferencia} ≥ ${margen} (art. 52.3).`,
            playerIds: [detras.jugador.playerId, delante.jugador.playerId],
          });
        }
      } else if (!estricto && esInversionOrden) {
        // Inversión de orden permitida porque la diferencia de ELO no
        // alcanza el margen (art. 52.3.a-b, a contrario) — solo en modo
        // permisivo (en modo estricto, ya se emitió el error 51.2 arriba).
        // Se acumula para deduplicar (finding 4) en vez de empujarse ya.
        const key = delante.jugador.playerId;
        const entry = inversionesLegalesPorDelante.get(key) ?? {
          delante: delante.jugador,
          tableroDelante: delante.tablero,
          detrasList: [],
        };
        entry.detrasList.push({ jugador: detras.jugador, tablero: detras.tablero, diferencia });
        inversionesLegalesPorDelante.set(key, entry);
      }
    }
  }

  for (const { delante, tableroDelante, detrasList } of inversionesLegalesPorDelante.values()) {
    if (detrasList.length === 1) {
      const { jugador: detrasJugador, tablero: tableroDetras, diferencia } = detrasList[0];
      infracciones.push({
        nivel: "aviso",
        tablero: tableroDetras,
        articulo: "52.3",
        mensaje: `Inversión legal (<${margen}): ${etiqueta(delante)} va por delante de ${etiqueta(
          detrasJugador
        )} con una diferencia de ${diferencia} < ${margen} (art. 52.3).`,
        playerIds: [delante.playerId, detrasJugador.playerId],
      });
    } else {
      infracciones.push({
        nivel: "aviso",
        tablero: tableroDelante,
        articulo: "52.3",
        mensaje: `${delante.nombre} (nº${delante.numero}) va por delante de ${detrasList.length} jugadores con mejor orden — inversión legal dentro del margen (<${margen}) (art. 52.3).`,
        playerIds: [delante.playerId, ...detrasList.map((d) => d.jugador.playerId)],
      });
    }
  }

  return infracciones;
}
