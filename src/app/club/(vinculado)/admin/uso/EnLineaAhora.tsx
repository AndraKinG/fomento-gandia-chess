"use client";

import { usePresencia } from "@/components/presencia/Presencia";
import { Dato } from "./Dato";

/**
 * Cuántos socios están conectados AHORA MISMO.
 *
 * Sale de la presencia que ya alimenta el círculo verde de toda la app, así que
 * no cuesta ninguna consulta: los navegadores se anuncian entre ellos por el
 * socket y esto solo cuenta cuántos hay. Se mueve solo, sin recargar.
 *
 * NO SE GUARDA EN NINGÚN SITIO, igual que el círculo verde: "estar conectado"
 * dura lo que dura una pestaña abierta. Por eso este número no aparece en la
 * tabla histórica — de ayer no se puede saber, y el panel no debe inventarlo.
 *
 * El admin se cuenta a sí mismo, que es lo correcto: está dentro.
 */
export function EnLineaAhora() {
  const { enLinea, listo } = usePresencia();

  return (
    <Dato
      titulo="En línea ahora"
      // Sin `listo` no se pinta un 0: durante el primer segundo no se sabe, y un
      // cero falso se lee como "no hay nadie".
      valor={listo ? String(enLinea.size) : "…"}
      nota="socios conectados"
      vivo={listo && enLinea.size > 0}
    />
  );
}
