/**
 * Contenedor de contenido de una pantalla.
 *
 * POR QUÉ EXISTE: había 31 pantallas con el ancho escrito a mano
 * (`mx-auto max-w-md p-4`), y solo 14 se ensanchaban en pantalla grande. En un
 * monitor eso deja una columna estrecha en el centro y el resto vacío. Con el
 * ancho en un solo sitio, ajustar el escritorio es cambiar este fichero y no
 * treinta y uno.
 *
 * Las tres medidas responden a para qué es el contenido, no a un número:
 *
 * - `formulario`: una columna. Un campo de texto de 1200 px de ancho es peor de
 *   usar que uno de 600, así que aquí ensanchar no ayuda.
 * - `lectura`: texto seguido y fichas de detalle. Se queda en la anchura donde
 *   una línea sigue siendo cómoda de leer.
 * - `panel`: listas, tablas y rejillas de tarjetas. Es el que aprovecha el
 *   monitor de verdad.
 */
export const ANCHOS = {
  formulario: "max-w-md sm:max-w-xl",
  lectura: "max-w-md sm:max-w-2xl lg:max-w-3xl",
  panel: "max-w-md sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl",
} as const;

export type Medida = keyof typeof ANCHOS;

export function Contenedor({
  medida = "lectura",
  className = "",
  children,
}: {
  medida?: Medida;
  /** Solo utilidades de espaciado o disposición; el ancho lo pone `medida`. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${ANCHOS[medida]} p-4 sm:p-6 ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Clases de rejilla de tarjetas que crece con la pantalla.
 *
 * En móvil es una columna, como hasta ahora; en tableta dos y en escritorio tres.
 * Se usa en las listas de tarjetas —equipos, torneos, partidas—, que son las que
 * peor se veían en un monitor: una tarjeta por fila con 1300 px de hueco al lado.
 *
 * Se expone como cadena de clases y no solo como componente porque casi todas
 * esas listas son `<ul>` con `<li>`: envolverlas en un `div` rompería la relación
 * lista/elemento que usan los lectores de pantalla.
 */
export const REJILLA = {
  2: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  3: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
} as const;

export function Rejilla({
  columnas = 2,
  className = "",
  children,
}: {
  /** Máximo de columnas en pantalla grande. */
  columnas?: 2 | 3;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`${REJILLA[columnas]} ${className}`.trim()}>{children}</div>;
}
