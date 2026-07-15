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
    if (tablerosVistos.has(entrada.tablero)) {
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El tablero ${entrada.tablero} está repetido en la alineación.`,
      });
      continue;
    }
    tablerosVistos.add(entrada.tablero);

    if (entrada.tablero < 1 || entrada.tablero > config.numTableros) {
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El tablero ${entrada.tablero} está fuera del rango 1..${config.numTableros} del equipo.`,
      });
      continue;
    }

    if (jugadoresVistos.has(entrada.playerId)) {
      infracciones.push({
        nivel: "error",
        tablero: entrada.tablero,
        articulo: "estructural",
        mensaje: `El jugador ${entrada.playerId} está alineado en más de un tablero.`,
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
    });
  }

  // --- 4. R1 (art. 51.2) y R2 (art. 52.3): comparar TODAS las parejas de
  // tableros ocupados (i < j), no solo adyacentes. --------------------------
  const margen = config.margenElo;

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
          infracciones.push({
            nivel: "error",
            tablero: detras.tablero,
            articulo: "51.2",
            mensaje: `${etiqueta(detras.jugador)} no puede ir en el tablero ${detras.tablero}, por detrás de ${etiqueta(
              delante.jugador
            )} en el tablero ${delante.tablero}: tiene mejor orden de fuerza (art. 51.2).`,
          });
        }
        continue;
      }

      // Con margen (art. 52.3): "un jugador no esté por delante de otro que
      // le supere en M puntos ELO o más". El texto no condiciona esto a que
      // haya inversión de orden: se compara SIEMPRE fuerza(detrás) vs
      // fuerza(delante) para cualquier pareja de tableros. Por eso el check
      // de margen es independiente del check de inversión de orden.
      const diferencia = detras.jugador.fuerza - delante.jugador.fuerza;

      if (diferencia >= margen) {
        if (delante.jugador.excepcionMargen) {
          // arts. 52.3.d-e: exención de tecnificación o +75 años concedida
          // al jugador de delante (el que "se salva" de ser superado).
          infracciones.push({
            nivel: "aviso",
            tablero: detras.tablero,
            articulo: "52.3",
            mensaje: `${etiqueta(detras.jugador)} supera a ${etiqueta(
              delante.jugador
            )} en ${diferencia} ≥ ${margen}, pero ${delante.jugador.nombre} tiene excepción de margen autorizada (arts. 52.3.d-e).`,
          });
        } else {
          infracciones.push({
            nivel: "error",
            tablero: detras.tablero,
            articulo: "52.3",
            mensaje: `${etiqueta(delante.jugador)} no puede ir por delante de ${etiqueta(
              detras.jugador
            )} en el tablero ${detras.tablero}: le supera en ${diferencia} ≥ ${margen} (art. 52.3).`,
          });
        }
      } else if (esInversionOrden) {
        // Inversión de orden permitida porque la diferencia de ELO no
        // alcanza el margen (art. 52.3.a-b, a contrario).
        infracciones.push({
          nivel: "aviso",
          tablero: detras.tablero,
          articulo: "52.3",
          mensaje: `Inversión legal (<${margen}): ${etiqueta(delante.jugador)} va por delante de ${etiqueta(
            detras.jugador
          )} con una diferencia de ${diferencia} < ${margen} (art. 52.3).`,
        });
      }
    }
  }

  return infracciones;
}
