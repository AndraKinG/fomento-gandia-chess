/**
 * Elección de temporada en las pantallas de Interclubs.
 *
 * POR QUÉ EXISTE: de la temporada cuelga todo el Interclubs —equipos, y de ellos
 * jornadas, clasificaciones, convocatorias y actas—, y hasta ahora once pantallas
 * pedían "la temporada activa" sin más. Al activar la 2027, la 2026 iba a
 * desaparecer de la interfaz: los datos seguían en la base, pero sin ninguna puerta
 * para llegar a ellos.
 *
 * Solo las pantallas de CONSULTA eligen temporada. Los IMPORTADORES siguen atados a la
 * activa a propósito: se importa sobre la temporada en curso, y `/club/vincular` lista
 * el orden de fuerza vigente.
 *
 * LAS PANTALLAS DE ADMIN NO, y esto se corrigió el 2026-09-23 al cerrar la temporada
 * 2026 (terminó en marzo y seguía marcada como activa). El diseño daba por hecho que
 * SIEMPRE hay una temporada activa, y no es verdad: el Interclubs va de enero a marzo,
 * así que **nueve meses al año no hay ninguna en curso**. Con la 2026 cerrada, la lista
 * de 46 socios de `/club/admin/orden-fuerza` desapareció —con ella, los editores de
 * mote— y `/club/admin/equipos` se quedó en "No hay temporada activa". Se leía como que
 * la app había perdido los datos.
 */

export type Temporada = {
  id: string;
  nombre: string;
  activa: boolean;
};

/**
 * Qué temporada se enseña, dado lo que pide la URL.
 *
 * Nunca falla ni deja la pantalla en blanco por un parámetro raro: si el id pedido no
 * existe —enlace viejo, temporada borrada, alguien tocando la URL— se cae a la activa,
 * y si no hay ninguna activa, a la primera de la lista. Con una lista vacía devuelve
 * null y quien llame enseña su estado vacío.
 *
 * `temporadas` se espera ya ordenada de más reciente a más antigua.
 */
export function elegirTemporada(
  temporadas: readonly Temporada[],
  idPedido?: string | null
): Temporada | null {
  if (temporadas.length === 0) return null;
  if (idPedido) {
    const pedida = temporadas.find((t) => t.id === idPedido);
    if (pedida) return pedida;
  }
  return temporadas.find((t) => t.activa) ?? temporadas[0];
}

/**
 * Añade la temporada a una ruta, y solo cuando hace falta.
 *
 * En la activa no se pone nada: así los enlaces que se comparten por WhatsApp siguen
 * siendo los de siempre y no se llenan de parámetros que además caducan al cambiar de
 * temporada.
 */
export function conTemporada(ruta: string, temporada: Temporada | null): string {
  if (!temporada || temporada.activa) return ruta;
  const separador = ruta.includes("?") ? "&" : "?";
  return `${ruta}${separador}temporada=${temporada.id}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cliente = import("@supabase/supabase-js").SupabaseClient<any, "public", any>;

/**
 * Todas las temporadas, de la más reciente a la más antigua.
 *
 * Se ordena por `created_at` y no por el nombre: "Interclubs 2026" ordena bien por
 * casualidad, pero en cuanto una se llame de otro modo el orden alfabético miente.
 */
export async function leerTemporadas(supabase: Cliente): Promise<Temporada[]> {
  const { data } = await supabase
    .from("seasons")
    .select("id, nombre, activa")
    .order("created_at", { ascending: false });
  return (data ?? []) as Temporada[];
}

/**
 * La temporada sobre la que trabajan las pantallas de ADMINISTRACIÓN.
 *
 * La activa si la hay; si no, la más reciente. Administrar la última temporada fuera
 * de temporada es lo normal —repasar el orden de fuerza, poner motes, mirar quién fue
 * capitán—, y quedarse sin pantalla nueve meses al año no lo es.
 *
 * NO SE USA PARA IMPORTAR: los importadores crean la temporada si hace falta y siguen
 * mirando la activa, que es lo correcto — importar el orden de fuerza nuevo sobre la
 * temporada vieja lo machacaría.
 */
export async function temporadaDeAdmin(supabase: Cliente): Promise<Temporada | null> {
  const temporadas = await leerTemporadas(supabase);
  return temporadas.find((t) => t.activa) ?? temporadas[0] ?? null;
}
