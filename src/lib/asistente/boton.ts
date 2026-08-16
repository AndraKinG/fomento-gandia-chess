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

/* ---------------------------------------------------------------------------
 * ARRASTRARLO A DONDE SEA (migración 0045)
 *
 * Dos esquinas son dos sitios, y el botón flota sobre TODAS las pantallas de la zona de
 * socios: lo que estorba cambia según la pantalla. Así que además de las esquinas se
 * puede coger y soltar donde uno quiera.
 *
 * SE GUARDA EN FRACCIONES DE PANTALLA Y NO EN PÍXELES: en píxeles, el sitio elegido en
 * el monitor cae fuera de cuadro en el móvil, y girar el teléfono manda el botón al
 * limbo. Y NULL SIGUE SIENDO LA ESQUINA de la 0044, así que quien no arrastre nada no
 * nota ningún cambio.
 * ------------------------------------------------------------------------ */

/** Dónde está el botón, en fracciones de pantalla (0 a 1), medido en su centro. */
export type Punto = { x: number; y: number };

/** Lo que mide el botón, en píxeles (`h-14 w-14`). */
export const LADO_BOTON = 56;

/** Aire que se le deja al borde de la pantalla. */
export const MARGEN_BORDE = 8;

/**
 * Cuánto hay que mover el dedo para que cuente como arrastre y no como toque.
 *
 * SIN ESTO EL BOTÓN NO SE PODRÍA ABRIR: un dedo nunca toca del todo quieto, así que
 * cualquier píxel de temblor se leería como "lo has movido" y el chat no se abriría
 * nunca. Ocho píxeles es lo que separa un toque de un arrastre con el dedo.
 */
export const UMBRAL_ARRASTRE = 8;

/** ¿Ha sido un arrastre, o un toque con pulso? */
export function esArrastre(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= UMBRAL_ARRASTRE;
}

/**
 * Lo guardado en la base, con red: hacen falta LAS DOS coordenadas y las dos dentro de
 * la pantalla. Media posición no es una posición.
 */
export function posicionGuardada(
  x: number | null | undefined,
  y: number | null | undefined
): Punto | null {
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/**
 * Un punto en píxeles llevado a fracciones, SIN QUE EL BOTÓN SE SALGA.
 *
 * Se sujeta al soltar y no al pintar porque lo que se guarda tiene que ser ya válido:
 * un botón medio fuera de cuadro no se puede volver a coger para traerlo.
 */
export function sujetar(
  px: number,
  py: number,
  ancho: number,
  alto: number,
  lado = LADO_BOTON
): Punto {
  const mitad = lado / 2 + MARGEN_BORDE;
  const entre = (v: number, min: number, max: number) =>
    max <= min ? (min + max) / 2 : Math.min(Math.max(v, min), max);
  return {
    x: entre(px, mitad, ancho - mitad) / (ancho || 1),
    y: entre(py, mitad, alto - mitad) / (alto || 1),
  };
}

/** De fracciones a píxeles del centro, para pintar. */
export function aPixeles(p: Punto, ancho: number, alto: number): Punto {
  return { x: p.x * ancho, y: p.y * alto };
}

/**
 * Por qué lado se abre la ventana del chat.
 *
 * Se abre HACIA DENTRO de la pantalla: con el botón a la derecha, la ventana crece
 * hacia la izquierda. Al revés se saldría por el borde y quedaría medio chat fuera.
 */
export function ladoDelPanel(p: Punto): "izquierda" | "derecha" {
  return p.x > 0.5 ? "derecha" : "izquierda";
}

/** Igual con la altura: con el botón arriba, la ventana baja; abajo, sube. */
export function panelHaciaAbajo(p: Punto): boolean {
  return p.y < 0.5;
}
