/**
 * Dónde se pone el botón flotante del asistente, o si no se pone.
 *
 * POR QUÉ ES UNA OPCIÓN Y NO UNA DECISIÓN NUESTRA (lo pidió el propietario: "mover
 * botón asistente ia al gusto o ocultarlo"): el botón flota SOBRE toda la zona de
 * socios, así que tapa la esquina de abajo a la derecha de todas las pantallas —en el
 * panel de uso, la última columna de la tabla—. Y qué esquina estorba depende de la
 * mano con la que se sujeta el móvil y de lo que cada uno mire más, que no es algo que
 * se pueda acertar desde aquí.
 *
 * OCULTO ESCONDE EL BOTÓN, NO EL ASISTENTE: se apaga desde el perfil y desde ahí mismo
 * se vuelve a encender. Un ajuste que deja una función inalcanzable para siempre no es
 * un ajuste, es una trampa.
 *
 * MÓDULO PURO Y CON TESTS porque de aquí salen CLASES DE TAILWIND, y una clase mal
 * escrita no falla: el botón simplemente se va a la esquina de arriba a la izquierda y
 * nadie se entera hasta que lo ve. Además tienen que estar escritas ENTERAS en el
 * código (Tailwind lee los ficheros como texto y no genera lo que no encuentra), así
 * que aquí van literales y no compuestas con plantillas.
 */

export type SitioBoton = "derecha" | "izquierda" | "oculto";

export const SITIO_POR_DEFECTO: SitioBoton = "derecha";

/** Las opciones, tal y como se enseñan en el perfil. */
export const SITIOS: { clave: SitioBoton; nombre: string; detalle: string }[] = [
  { clave: "derecha", nombre: "Abajo a la derecha", detalle: "Donde está siempre" },
  { clave: "izquierda", nombre: "Abajo a la izquierda", detalle: "Si estorba en la derecha" },
  { clave: "oculto", nombre: "Oculto", detalle: "Se enciende otra vez desde aquí" },
];

/** Lo guardado en `profiles.asistente_boton`, con red: null o valor raro → el de siempre. */
export function sitioBoton(clave: string | null | undefined): SitioBoton {
  return SITIOS.some((s) => s.clave === clave) ? (clave as SitioBoton) : SITIO_POR_DEFECTO;
}

/** ¿Se pinta el botón? */
export function seVeElBoton(clave: string | null | undefined): boolean {
  return sitioBoton(clave) !== "oculto";
}

/**
 * El lado del botón redondo.
 *
 * `bottom-24` en móvil para no quedar debajo de la barra inferior; en escritorio esa
 * barra no existe y baja a su sitio.
 */
export function clasesBoton(sitio: SitioBoton): string {
  return sitio === "izquierda"
    ? "bottom-24 left-4 lg:bottom-6 lg:left-6"
    : "bottom-24 right-4 lg:bottom-6 lg:right-6";
}

/**
 * El lado de la ventana del chat, que tiene que abrirse SOBRE su botón.
 *
 * En móvil ocupa el ancho entero (`inset-x-2`) y el lado da igual; a partir de `sm` se
 * ancla al mismo borde que el botón, porque una ventana que sale por el lado contrario
 * al que has tocado se lee como que has abierto otra cosa.
 */
export function clasesPanel(sitio: SitioBoton): string {
  return sitio === "izquierda"
    ? "bottom-40 lg:bottom-24 sm:left-4 lg:left-6"
    : "bottom-40 lg:bottom-24 sm:right-4 lg:right-6";
}
