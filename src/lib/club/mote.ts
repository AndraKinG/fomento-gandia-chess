/**
 * Reglas de un mote del club: qué vale como mote y cuándo está libre.
 *
 * EN UN MÓDULO COMPARTIDO porque desde el 2026-08-13 hay DOS PUERTAS: el socio lo pide
 * desde su perfil y la junta lo escribe directamente desde la pantalla de ELO. Si cada
 * una validara por su cuenta acabarían discrepando, y la forma en que discreparían es
 * la peor posible: el socio pide "Ximo", se le dice que vale, y al aprobarlo salta un
 * error de la base que ya no sabe explicar nadie.
 *
 * LA PARTE PURA (formato) y la que necesita base (¿está libre?) están separadas a
 * propósito: la primera se prueba sin base de datos, y la segunda es una consulta que
 * hay que hacer igual desde las dos puertas.
 */

/** Lo que cabe en una fila de tabla sin romperla, y lo mínimo para ser un nombre. */
export const MOTE_MIN = 2;
export const MOTE_MAX = 40;

export type Mote = { ok: true; valor: string } | { ok: false; error: string };

/**
 * Limpia y comprueba el formato de un mote.
 *
 * Normaliza SIEMPRE antes de comparar o guardar: " Ximo  Gran " y "Ximo Gran" son el
 * mismo mote, y guardar los dos haría que el índice único de la 0042 dejara pasar un
 * duplicado que en pantalla se ve idéntico.
 *
 * Vacío NO es un error: es "quítame el mote". Devuelve cadena vacía y quien llame
 * decide (la junta lo borra; el socio retira su solicitud).
 */
export function validarMote(texto: string): Mote {
  // Este primer paso convierte saltos de línea y tabuladores en espacios, así que a
  // partir de aquí un mote es siempre una línea.
  const valor = texto.replace(/\s+/g, " ").trim();
  if (valor === "") return { ok: true, valor: "" };

  if (valor.length < MOTE_MIN || valor.length > MOTE_MAX) {
    return { ok: false, error: `El mote va de ${MOTE_MIN} a ${MOTE_MAX} letras.` };
  }
  // Los caracteres de control que NO son espacio en blanco (`\0`, los de un copiar y
  // pegar raro) sobreviven al paso de arriba, y el mote va dentro de una fila de tabla
  // y en el cuerpo de un push: ahí uno de estos rompe la pantalla o el aviso.
  if ([...valor].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127)) {
    return { ok: false, error: "El mote lleva caracteres que no valen." };
  }
  // Al menos una letra o número: "¿?" o "..." no identifican a nadie, que es lo único
  // que un mote tiene que hacer.
  if (!/[\p{L}\p{N}]/u.test(valor)) {
    return { ok: false, error: "El mote tiene que llevar alguna letra." };
  }
  return { ok: true, valor };
}

/** La clave con la que se comparan dos motes: sin mayúsculas y sin espacios de más. */
export function claveMote(mote: string): string {
  return mote.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Un socio, para comprobar si su mote (puesto o pedido) choca con el que se quiere. */
export type SocioConMote = {
  nombre: string;
  apodo?: string | null;
  apodoSolicitado?: string | null;
};

/**
 * ¿Choca este mote con el de otro socio, puesto o pedido?
 *
 * CUENTA TAMBIÉN LAS SOLICITUDES PENDIENTES, y es la mitad que se olvida: sin eso, dos
 * socios piden "Ximo" el mismo día, a los dos se les dice que perfecto, y el problema
 * aparece cuando la junta aprueba el segundo. Quien pide primero, reserva.
 *
 * Recibe las filas ya leídas para poder probarse sin base de datos.
 */
export function moteOcupado(
  mote: string,
  otros: readonly SocioConMote[]
): { nombre: string; pedido: boolean } | null {
  const clave = claveMote(mote);
  if (!clave) return null;
  for (const o of otros) {
    if (o.apodo && claveMote(o.apodo) === clave) {
      return { nombre: o.nombre, pedido: false };
    }
    if (o.apodoSolicitado && claveMote(o.apodoSolicitado) === clave) {
      return { nombre: o.nombre, pedido: true };
    }
  }
  return null;
}

/** El aviso que se le da a quien intenta usar un mote ocupado. */
export function textoOcupado(quien: { nombre: string; pedido: boolean }): string {
  return quien.pedido
    ? `Ese mote lo ha pedido antes ${quien.nombre}.`
    : `Ese mote ya es de ${quien.nombre}.`;
}
