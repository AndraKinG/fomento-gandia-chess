import type { ConfigEquipo, ContextoClub, Infraccion, JugadorOrden, TableroPropuesto } from "./tipos";
import { validarNucleo } from "./nucleo";
import { validarContexto } from "./contexto";

export * from "./tipos";
export { validarNucleo } from "./nucleo";
export { validarContexto } from "./contexto";

/** Orquestador: ejecuta el núcleo (arts. 50-52, sin contexto de club) y el
 * contexto (arts. 51.1/51.3/51.4/51.5.c, 52.4, 54-55) y concatena todas las
 * infracciones resultantes. Módulo PURO, sin I/O (ver nucleo.ts/contexto.ts). */
export function validar(
  orden: JugadorOrden[],
  alineacion: TableroPropuesto[],
  config: ConfigEquipo,
  ctx: ContextoClub
): Infraccion[] {
  return [...validarNucleo(orden, alineacion, config), ...validarContexto(orden, alineacion, config, ctx)];
}
