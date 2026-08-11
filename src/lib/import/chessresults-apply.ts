import { createAdminClient } from "@/lib/supabase/admin";
import { normalizaNombre, URL_CALENDARIO } from "@/lib/import/facv-calendario";
import { parseEnlacesAlineacionFACV } from "@/lib/import/facv-resultados";
import {
  parseAlineacionesChessResults,
  tnrDeUrl,
  urlAlineaciones,
  type EncuentroChessResults,
} from "@/lib/import/chessresults";
import {
  enParalelo,
  esUrlDeChessResults,
  fetchConLimite,
  LIMITE_PAGINA_GRANDE_MS,
} from "@/lib/import/red";
import { buscarFicha, indicePorNombre } from "@/lib/import/cruzar-nombres";

type Sufijo = "A" | "B" | "C";

/** Mismo criterio que el resto de importadores (duplicado a propósito: cada módulo
 *  de import es autocontenido). */
function sufijoEquipo(nombre: string): Sufijo {
  const n = normalizaNombre(nombre);
  if (n.endsWith(" b")) return "B";
  if (n.endsWith(" c")) return "C";
  return "A";
}

export type ResumenSyncActas = {
  /** Jornadas cuyo acta se ha escrito o refrescado. */
  jornadas: number;
  /** Tableros guardados en total. */
  tableros: number;
  /** Tableros cuyo nombre se ha podido cruzar con una ficha del club. */
  vinculados: number;
  /** Encuentros del acta que no tienen jornada en la app todavía. */
  omitidos: number;
  /**
   * Nombres del acta que no han cruzado con ninguna ficha del club, sin repetir.
   *
   * SE REPORTAN en vez de dejarlos en un contador: son casos que solo puede resolver
   * una persona —un mote en vez del nombre ("Ximo" por "Joaquim"), un nombre de pila
   * de más en la ficha, o alguien que jugó y ya no es socio— y verlos es lo que
   * permite corregir la ficha. Un "212 de 248" a secas no dice a quién le falta.
   */
  nombresSinFicha: string[];
  avisos: string[];
  error?: string;
};

/**
 * Descarga las actas por tableros de chess-results y las guarda en `match_boards`.
 *
 * TRES PÁGINAS, UNA POR GRUPO. Cada enlace "Alineación" sin `&rd=` trae las once
 * rondas del grupo, así que con tres descargas se cubre la temporada entera de los
 * tres equipos. Van en paralelo con el limitador de `red.ts`, no en fila.
 *
 * SE VUELVE A ESCRIBIR EL ACTA COMPLETA de cada jornada en cada sincronización, en
 * vez de intentar detectar qué ha cambiado. Un acta corregida por el árbitro cambia
 * resultados existentes, no solo añade tableros, y comparar para ahorrar escrituras
 * dejaría los datos viejos si la comparación falla. Son 8 filas por jornada.
 *
 * NO TOCA `matches` ni el marcador. El marcador tiene su propia regla —los tableros
 * del capitán mandan sobre la sync FACV (`marcadorPreferido`)— y meter una tercera
 * fuente en esa decisión sin que nadie lo haya pedido sería cambiarla a escondidas.
 * El acta es información añadida, no una corrección.
 *
 * NO exportar directamente desde una acción de servidor sin comprobar antes que
 * quien invoca es admin.
 */
export async function sincronizarActasCore(): Promise<ResumenSyncActas> {
  const vacio: ResumenSyncActas = {
    jornadas: 0,
    tableros: 0,
    vinculados: 0,
    omitidos: 0,
    nombresSinFicha: [],
    avisos: [],
  };

  try {
    const admin = createAdminClient();

    const { data: season } = await admin
      .from("seasons")
      .select("id")
      .eq("activa", true)
      .maybeSingle();
    if (!season) return { ...vacio, error: "No hay ninguna temporada activa" };

    const { data: equipos } = await admin
      .from("teams")
      .select("id, nombre")
      .eq("season_id", season.id);
    if (!equipos || equipos.length === 0) {
      return { ...vacio, error: "No hay equipos dados de alta en la temporada activa" };
    }

    const equipoPorSufijo = new Map<Sufijo, string>();
    for (const eq of equipos) equipoPorSufijo.set(sufijoEquipo(eq.nombre), eq.id);
    const equipoA = equipos.find((e) => sufijoEquipo(e.nombre) === "A");
    const nombreBase = equipoA?.nombre ?? equipos[0].nombre.replace(/ [BC]$/i, "");
    const baseNorm = normalizaNombre(nombreBase);

    // Jornadas ya creadas, para saber a qué encuentro del acta corresponde cada una.
    const { data: jornadas } = await admin
      .from("matches")
      .select("id, team_id, ronda, es_local")
      .in(
        "team_id",
        equipos.map((e) => e.id)
      );
    const jornadaPorClave = new Map(
      (jornadas ?? []).map((m) => [`${m.team_id}/${m.ronda}`, m])
    );

    // Fichas del club, para cruzar los nombres del acta. El cruce va por conjunto
    // de palabras y no por cadena: `players.nombre` tiene los dos formatos mezclados
    // ("Apellidos, Nombre" y "Nombre Apellidos") y el acta usa siempre el primero, así
    // que comparar cadenas enlazaba CERO de 248 tableros sin dar ningún error.
    // El `alias` (migración 0035) entra en el cruce: hay socios cuya ficha va con
    // el nombre de uso ("Ximo") y el acta con el de pila ("Joaquim").
    const { data: players } = await admin.from("players").select("id, nombre, alias");
    const indiceFichas = indicePorNombre(
      (players ?? []).map((p) => ({
        id: p.id as string,
        nombre: p.nombre as string,
        alias: p.alias as string | null,
      }))
    );

    const calendario = await fetchConLimite(URL_CALENDARIO, {
      limiteMs: LIMITE_PAGINA_GRANDE_MS,
    });
    if (!calendario.ok) {
      return { ...vacio, error: `No se pudo descargar el calendario (HTTP ${calendario.status})` };
    }
    const enlaces = parseEnlacesAlineacionFACV(await calendario.text(), nombreBase);
    if (enlaces.length === 0) {
      return {
        ...vacio,
        error:
          "El calendario de la FACV no trae enlaces de alineación de ningún grupo del club (¿rediseño de su web?)",
      };
    }

    const avisos: string[] = [];

    // Las páginas de los grupos, en paralelo. Son 250 KB cada una, así que van con el
    // límite de página grande.
    const paginas = await enParalelo(
      enlaces.map((e) => async () => {
        const tnr = tnrDeUrl(e.url);
        // Se reconstruye la URL en vez de usar la del enlace tal cual: así se
        // garantiza que va sin `&rd=` y con los parámetros que espera el parser.
        // Y si no se pudo reconstruir (sin tnr), la del enlace solo se sigue si
        // apunta de verdad a chess-results: viene del HTML de la FACV, no de
        // nosotros, y el cron la seguiría con privilegio de servidor.
        const url = tnr ? urlAlineaciones(tnr) : e.url;
        if (!tnr && !esUrlDeChessResults(url)) {
          avisos.push(`${e.grupo}: el enlace del acta no apunta a chess-results (${url})`);
          return [] as EncuentroChessResults[];
        }
        const res = await fetchConLimite(url, { limiteMs: LIMITE_PAGINA_GRANDE_MS });
        if (!res.ok) {
          avisos.push(`${e.grupo}: no se pudo descargar el acta (HTTP ${res.status})`);
          return [] as EncuentroChessResults[];
        }
        const encuentros = parseAlineacionesChessResults(await res.text());
        if (encuentros.length === 0) {
          avisos.push(`${e.grupo}: el acta no trae ningún encuentro`);
        }
        return encuentros;
      }),
      3
    );

    let jornadasEscritas = 0;
    let tableros = 0;
    let vinculados = 0;
    let omitidos = 0;
    const sinFicha = new Set<string>();

    for (const encuentro of paginas.flat()) {
      const localEsNuestro = normalizaNombre(encuentro.local).includes(baseNorm);
      const visitanteEsNuestro = normalizaNombre(encuentro.visitante).includes(baseNorm);
      // Los grupos traen los encuentros de todos los equipos, no solo los nuestros.
      if (!localEsNuestro && !visitanteEsNuestro) continue;

      const nuestroNombreEquipo = localEsNuestro ? encuentro.local : encuentro.visitante;
      const equipoId = equipoPorSufijo.get(sufijoEquipo(nuestroNombreEquipo));
      if (!equipoId) {
        omitidos++;
        continue;
      }

      const jornada = jornadaPorClave.get(`${equipoId}/${encuentro.ronda}`);
      if (!jornada) {
        // Sin jornada en la app todavía: hay que sincronizar antes el calendario.
        omitidos++;
        continue;
      }

      const conResultado = encuentro.tableros.filter((t) => t.resultadoLocal !== null);
      if (conResultado.length === 0) continue; // ronda sin jugar

      const filas = encuentro.tableros.map((t) => {
        const nuestroNombre = localEsNuestro ? t.localNombre : t.visitanteNombre;
        const ficha = buscarFicha(nuestroNombre, indiceFichas);
        if (ficha) vinculados++;
        else sinFicha.add(nuestroNombre);
        // El resultado del acta viene desde el lado del LOCAL: si nosotros somos el
        // visitante hay que darle la vuelta. Sin esto, media temporada saldría con
        // los resultados invertidos.
        const resultado =
          t.resultadoLocal === null
            ? null
            : localEsNuestro
              ? t.resultadoLocal
              : t.resultadoLocal === "1"
                ? "0"
                : t.resultadoLocal === "0"
                  ? "1"
                  : "0.5";
        return {
          match_id: jornada.id,
          tablero: t.tablero,
          nuestro_nombre: nuestroNombre,
          nuestro_elo: localEsNuestro ? t.localElo : t.visitanteElo,
          nuestro_player_id: ficha,
          nuestras_blancas: localEsNuestro ? t.localBlancas : !t.localBlancas,
          rival_nombre: localEsNuestro ? t.visitanteNombre : t.localNombre,
          rival_elo: localEsNuestro ? t.visitanteElo : t.localElo,
          resultado,
          incomparecencia: t.incomparecencia,
          actualizado_at: new Date().toISOString(),
        };
      });

      const { error } = await admin
        .from("match_boards")
        .upsert(filas, { onConflict: "match_id,tablero" });
      if (error) {
        avisos.push(`R${encuentro.ronda} ${nuestroNombreEquipo}: ${error.message}`);
        continue;
      }
      jornadasEscritas++;
      tableros += filas.length;
    }

    return {
      jornadas: jornadasEscritas,
      tableros,
      vinculados,
      omitidos,
      nombresSinFicha: [...sinFicha].sort(),
      avisos,
    };
  } catch {
    return { ...vacio, error: "Error al sincronizar las actas por tableros" };
  }
}
