/**
 * Validación de las solicitudes de ingreso al club.
 *
 * Módulo puro: sin base de datos ni red, para poder testear las reglas de lo que
 * se acepta como solicitud sin montar nada.
 */

export type DatosSolicitud = {
  nombre: string;
  email: string;
  telefono?: string;
  mensaje?: string;
};

export type SolicitudLimpia = {
  nombre: string;
  email: string;
  telefono: string | null;
  mensaje: string | null;
};

export type Validacion =
  | { ok: true; datos: SolicitudLimpia }
  | { ok: false; error: string };

const MAX_NOMBRE = 80;
const MAX_MENSAJE = 1000;

/**
 * Comprobación de email deliberadamente laxa: algo@algo.algo.
 *
 * Validar emails "de verdad" con una expresión regular es imposible (la
 * gramática real admite cosas que nadie escribe) y las reglas estrictas rechazan
 * direcciones válidas. Lo único que importa aquí es cazar el error de dedo obvio;
 * si el email no existe, se descubrirá al escribirle, que es lo que va a pasar de
 * todas formas.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Recorta espacios y colapsa los internos, que llegan al copiar y pegar. */
function limpiar(texto: string | undefined): string {
  return (texto ?? "").replace(/\s+/g, " ").trim();
}

export function validarSolicitud(datos: DatosSolicitud): Validacion {
  const nombre = limpiar(datos.nombre);
  if (nombre.length < 2) return { ok: false, error: "Escribe tu nombre." };
  if (nombre.length > MAX_NOMBRE) {
    return { ok: false, error: "Ese nombre es demasiado largo." };
  }

  const email = limpiar(datos.email).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Revisa el email: no parece una dirección válida." };
  }

  // El mensaje se recorta pero conservando los saltos de línea, que aquí sí
  // significan algo: la gente escribe párrafos.
  const mensaje = (datos.mensaje ?? "").trim().slice(0, MAX_MENSAJE);
  const telefono = limpiar(datos.telefono);

  return {
    ok: true,
    datos: {
      nombre,
      email,
      telefono: telefono || null,
      mensaje: mensaje || null,
    },
  };
}
