import { Cargando } from "@/components/ui/Cargando";

/**
 * Sin esto Next no precarga nada de esta ruta (es dinámica, como todas las de
 * `/club`): el esqueleto no es cosmético, es lo que hace que el enlace del
 * número rojo del menú responda al instante en vez de dejar la pantalla
 * anterior congelada mientras llega la consulta.
 */
export default function Loading() {
  return <Cargando medida="panel" filas={6} />;
}
