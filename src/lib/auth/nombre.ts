/**
 * Nombre de pila de un socio, para saludar.
 *
 * En módulo aparte de `sesion.ts` a propósito: eso arrastra el cliente de
 * Supabase y `next/headers`, y esto es una función de texto que se puede probar
 * sola.
 *
 * HAY DOS FORMATOS DE NOMBRE EN LA BASE y los dos son reales: el orden de fuerza
 * de la FACV llega como "Apellidos, Nombre" y las fichas que se han tocado a mano
 * están como "Nombre Apellidos". No se puede elegir uno, hay que aguantar los dos.
 */
export function nombreDePila(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const conComa = nombre.split(",");
  // Con coma, el nombre está detrás; sin coma, delante.
  const trozo = conComa.length > 1 ? conComa[1] : conComa[0];
  return trozo.trim().split(/\s+/)[0] || null;
}
