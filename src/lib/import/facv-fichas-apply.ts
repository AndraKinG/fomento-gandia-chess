import { createAdminClient } from "@/lib/supabase/admin";
import {
  claveDeFicha,
  claveDeTorneo,
  cuantasPaginas,
  parsearFichasTorneo,
  urlWidget,
  type FichaTorneoFACV,
} from "@/lib/import/facv-fichas-torneo";
import { fetchConLimite, LIMITE_PAGINA_GRANDE_MS } from "@/lib/import/red";

export type ResumenFichas = {
  /** Tarjetas leídas del widget. */
  tarjetas: number;
  /** Torneos nuestros a los que se les ha puesto o corregido algún enlace. */
  enlazados: number;
  error?: string;
};

/** Tope de páginas del widget, por si algún día su paginación se descontrola. */
const MAX_PAGINAS = 12;

/**
 * Rellena `url_facv` y `url_resultados` de los torneos con la información de las
 * tarjetas del widget de la portada de la FACV.
 *
 * POR QUÉ SE PUEDE AUTOMATIZAR ESTO Y NO LOS ELOs DE LA FIDE: facv.org se descarga sin
 * problema desde Vercel —es lo que ya hace la sync del fin de semana con el orden de fuerza y
 * el ranking—, mientras que fide.com bloquea las IPs de centro de datos. La diferencia
 * no es de código, es de quién te deja entrar.
 *
 * SOLO ESCRIBE CUANDO HAY ALGO NUEVO, y solo estas dos columnas: `url_bases` la rellena
 * una persona a mano y no se toca ni para mejorarla. Si la FACV quita un enlace, aquí se
 * borra el nuestro (a null) — es su dato, y conservar un enlace que ya no existe es peor
 * que no tener ninguno.
 *
 * NO TOCA los torneos `origen = 'manual'`: los creó alguien del club y no están en el
 * calendario de la FACV.
 */
export async function sincronizarFichasTorneoFACV(): Promise<ResumenFichas> {
  const admin = createAdminClient();

  let tarjetas: FichaTorneoFACV[] = [];
  try {
    // La primera página dice cuántas hay; se piden todas porque el widget reparte los
    // torneos por fecha y el que nos interesa puede estar en cualquiera.
    const primera = await fetchConLimite(urlWidget(1), { limiteMs: LIMITE_PAGINA_GRANDE_MS });
    if (!primera.ok) return { tarjetas: 0, enlazados: 0, error: `HTTP ${primera.status}` };
    const html = await primera.text();
    tarjetas = parsearFichasTorneo(html);
    const paginas = Math.min(cuantasPaginas(html), MAX_PAGINAS);
    for (let p = 2; p <= paginas; p++) {
      const res = await fetchConLimite(urlWidget(p), { limiteMs: LIMITE_PAGINA_GRANDE_MS });
      if (!res.ok) continue; // una página que falla no invalida las demás
      tarjetas = tarjetas.concat(parsearFichasTorneo(await res.text()));
    }
  } catch (e) {
    return { tarjetas: 0, enlazados: 0, error: String(e).slice(0, 200) };
  }

  if (tarjetas.length === 0) {
    // NO SE ESCRIBE NADA: cero tarjetas casi siempre significa que han rediseñado el
    // widget, y en ese caso borrar los enlaces de todos los torneos sería lo peor.
    return { tarjetas: 0, enlazados: 0, error: "el widget no devolvió ninguna tarjeta" };
  }

  const porClave = new Map(tarjetas.map((t) => [claveDeFicha(t.nombre, t.dia, t.mes), t]));

  const { data: nuestros, error } = await admin
    .from("tournaments")
    .select("id, nombre, fecha_inicio, url_facv, url_resultados")
    .eq("origen", "facv");
  if (error) return { tarjetas: tarjetas.length, enlazados: 0, error: error.message };

  let enlazados = 0;
  for (const t of nuestros ?? []) {
    const clave = claveDeTorneo(t.nombre as string, t.fecha_inicio as string);
    if (!clave) continue;
    const ficha = porClave.get(clave);
    // Sin tarjeta no se decide nada: el widget es una ventana móvil y los torneos
    // viejos ya no salen. Borrarles el enlace por no estar en la ventana sería
    // confundir "no lo veo" con "no lo tiene".
    if (!ficha) continue;
    if (ficha.urlFacv === t.url_facv && ficha.urlResultados === t.url_resultados) continue;
    const { error: fallo } = await admin
      .from("tournaments")
      .update({ url_facv: ficha.urlFacv, url_resultados: ficha.urlResultados })
      .eq("id", t.id as string);
    if (!fallo) enlazados++;
  }

  return { tarjetas: tarjetas.length, enlazados };
}
