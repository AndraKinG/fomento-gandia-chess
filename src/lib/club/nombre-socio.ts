/**
 * Cómo se llama a un socio en pantalla.
 *
 * MÓDULO PURO Y DE UNA SOLA LÍNEA a propósito: lo llaman una veintena de pantallas, y
 * lo que hace falta es que TODAS decidan igual. Repartir el `apodo ?? nombre` por ahí
 * garantiza que dentro de un mes tres sitios lo hagan distinto —uno recorta espacios,
 * otro trata la cadena vacía como un nombre válido— y que el club vea a la misma
 * persona con dos nombres según la pantalla.
 *
 * EL MOTE MANDA EN LAS PANTALLAS DEL CLUB (decisión del propietario, 2026-08-13): si en
 * el club llaman Ximo a alguien, en la app se llama Ximo. El nombre OFICIAL de la FACV
 * no se pierde: sigue en `players.nombre`, se enseña debajo del mote en el orden de
 * fuerza —que es un documento de la federación— y en su ficha, y es lo único que se usa
 * para cruzar las actas (ver `cruzar-nombres.ts`).
 */

/** Lo mínimo que hace falta saber de un socio para escribir su nombre. */
export type SocioConNombre = {
  nombre: string;
  apodo?: string | null;
};

/**
 * El nombre con el que se enseña a un socio: su mote si lo tiene, y si no el oficial.
 *
 * Una cadena vacía o con solo espacios NO es un mote: la base ya lo impide con un
 * check (migración 0041), pero esto también llega desde consultas viejas y desde
 * `undefined` cuando una pantalla todavía no pide la columna — y en ese caso lo
 * correcto es caer al nombre oficial, que es exactamente lo que se veía antes.
 */
export function nombreVisible(socio: SocioConNombre | null | undefined): string {
  if (!socio) return "Socio";
  const mote = (socio.apodo ?? "").trim();
  return mote || socio.nombre;
}

/**
 * Nombre visible de una fila cruda de Supabase (`{ nombre, apodo }`), tolerando el
 * `null` del embed cuando la relación no trae fila.
 *
 * Existe para no repetir el mismo `as unknown as { ... }` en cada pantalla: los embeds
 * de PostgREST llegan sin tipo útil y ese casteo es donde se colaban los errores.
 */
export function nombreDeFila(fila: unknown): string {
  return nombreVisible(fila as SocioConNombre | null);
}
