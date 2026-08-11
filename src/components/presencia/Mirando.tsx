"use client";

import { useEffect, useState } from "react";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { useQuienSoy } from "./Presencia";

/**
 * Quién está mirando ESTA pantalla ahora mismo.
 *
 * Como en Lichess: entras en una partida y ves quién más la está siguiendo, y en
 * cuanto alguien se va, desaparece. En un club esto es media gracia de tener las
 * partidas dentro de la app — saber que te están viendo, o ver quién anda por el
 * torneo.
 *
 * UNA SALA POR PANTALLA. La clave la pone quien lo monta (`partida-<id>`,
 * `torneo-<id>`…), y cada sala es un canal aparte: así el aviso de que alguien entra
 * en una partida no le llega a los cuarenta que están en otra.
 *
 * NO SE GUARDA NADA. La presencia dura lo que dura la pestaña abierta; cuando se
 * cierra, el socket lo dice solo. Guardarla obligaría a limpiar visitas muertas y a
 * distinguir un cierre limpio de un corte de red, y no aporta nada.
 *
 * EL NOMBRE VIAJA EN EL PROPIO ANUNCIO y no se busca luego en la base: es un dato
 * que ya tiene el navegador, y consultarlo sería un viaje por cada persona que
 * entra o sale.
 */
export function Mirando({ sala, excluir = [] }: { sala: string; excluir?: string[] }) {
  const yo = useQuienSoy();
  const [nombres, setNombres] = useState<string[]>([]);

  useEffect(() => {
    let cerrar: (() => void) | null = null;
    let cancelado = false;

    void clienteEnVivo().then(({ supabase }) => {
      if (cancelado) return;
      const canal = supabase.channel(`mirando-${sala}`, {
        config: { presence: { key: yo.ficha ?? `visita-${Math.random()}` } },
      });

      canal
        .on("presence", { event: "sync" }, () => {
          if (cancelado) return;
          const estado = canal.presenceState<{ nombre?: string }>();
          const lista = Object.values(estado)
            .map((entradas) => entradas[0]?.nombre)
            .filter((n): n is string => Boolean(n));
          // Ordenados para que la lista no baile de sitio en cada entrada y salida.
          setNombres([...new Set(lista)].sort((a, b) => a.localeCompare(b, "es")));
        })
        .subscribe(async (estado) => {
          if (cancelado || estado !== "SUBSCRIBED") return;
          await canal.track({ nombre: yo.nombre ?? "Alguien del club" });
        });

      cerrar = () => void supabase.removeChannel(canal);
    });

    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [sala, yo.ficha, yo.nombre]);

  // Uno mismo nunca sale, y quien ya esté pintado en la pantalla tampoco: en una
  // partida los dos jugadores están arriba y abajo con su círculo verde, y volver a
  // nombrar al rival aquí como "espectador" es decir dos veces lo mismo y encima mal.
  const otros = nombres.filter((n) => n !== yo.nombre && !excluir.includes(n));

  // Estar solo no es una novedad: no se enseña nada hasta que hay alguien más.
  if (otros.length === 0) return null;

  // CON MUCHA GENTE, EL NÚMERO Y NO LOS NOMBRES. En una final del torneo del club
  // pueden entrar cuarenta a mirar, y una lista de cuarenta nombres deja de ser un
  // dato para convertirse en un párrafo. Los nombres siguen estando en el `title`.
  if (otros.length > 4) {
    return (
      <p className="px-1 text-xs text-tinta-suave" title={otros.join(", ")}>
        <span aria-hidden>👁</span> {otros.length}
        {/* Para quien no ve el emoji, el texto completo: un ojo y un número
            solos no dicen nada a un lector de pantalla. */}
        <span className="sr-only"> personas viendo esto</span>
      </p>
    );
  }
  // EL OJO EN VEZ DE "VIENDO ESTO" (petición del propietario, 2026-08-12): el
  // emoji ya dice qué es esto y ahorra dos palabras en una línea que va junto al
  // tablero. Los nombres se quedan — son el dato — y el `title` los repite para
  // cuando se truncan.
  return (
    <p className="px-1 text-xs text-tinta-suave" title={otros.join(", ")}>
      <span aria-hidden>👁</span>
      <span className="sr-only">Viendo esto:</span> {otros.join(", ")}
    </p>
  );
}
