"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { clienteEnVivo } from "@/lib/supabase/vivo";

/**
 * Quién está conectado ahora mismo.
 *
 * VA POR UN CAMINO DISTINTO AL DE LAS JUGADAS, y eso importa: la presencia de
 * Supabase viaja por el mismo socket pero **no pasa por la RLS de ninguna tabla**,
 * porque no lee filas — los propios navegadores se anuncian entre ellos. Así que
 * sirve además de prueba: si el círculo verde funciona y los avisos de la partida
 * no, el problema está en las políticas y no en la conexión.
 *
 * NO SE GUARDA EN LA BASE a propósito. "Estar conectado" dura lo que dura una
 * pestaña abierta: guardarlo obligaría a limpiar sesiones muertas, a distinguir
 * cierres limpios de cortes de red, y a una tabla que se escribe cada pocos
 * segundos. El socket ya sabe quién sigue ahí, y cuando alguien se va lo dice solo.
 *
 * UN SOLO CANAL PARA TODO EL CLUB, montado en el layout: cada pantalla que quiera
 * pintar círculos lee de aquí en vez de abrir el suyo.
 */

type Presencia = {
  /** Fichas conectadas. */
  enLinea: Set<string>;
  /** false mientras no se sepa: sin esto se pintaría a todo el mundo desconectado
   *  durante el primer segundo, que es peor que no pintar nada. */
  listo: boolean;
};

const Contexto = createContext<Presencia>({ enLinea: new Set(), listo: false });

export function usePresencia(): Presencia {
  return useContext(Contexto);
}

export function ProveedorPresencia({
  yo,
  children,
}: {
  /** Ficha de quien mira. null = no se anuncia, pero sí ve a los demás. */
  yo: string | null;
  children: React.ReactNode;
}) {
  const [enLinea, setEnLinea] = useState<Set<string>>(new Set());
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cerrar: (() => void) | null = null;
    let cancelado = false;

    void clienteEnVivo().then(({ supabase }) => {
      if (cancelado) return;
      // La clave de presencia es la FICHA, no el usuario: es lo que se pinta al lado
      // de un nombre, y así dos pestañas abiertas del mismo socio cuentan como uno.
      const canal = supabase.channel("presencia-club", {
        config: { presence: { key: yo ?? "mirón" } },
      });

      canal
        .on("presence", { event: "sync" }, () => {
          if (cancelado) return;
          setEnLinea(new Set(Object.keys(canal.presenceState())));
          setListo(true);
        })
        .subscribe(async (estado) => {
          if (cancelado || estado !== "SUBSCRIBED") return;
          // Solo se anuncia quien tiene ficha: un espectador sin ficha no es nadie a
          // quien retar, así que pintarlo como conectado no aporta.
          if (yo) await canal.track({ desde: Date.now() });
          setListo(true);
        });

      cerrar = () => void supabase.removeChannel(canal);
    });

    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [yo]);

  return <Contexto.Provider value={{ enLinea, listo }}>{children}</Contexto.Provider>;
}

/**
 * El circulito de conectado.
 *
 * Lleva `title` y texto para lectores de pantalla porque un punto de color no dice
 * nada por sí solo: quien no distingue el verde tiene que poder saberlo igual.
 */
export function PuntoConectado({ ficha, className = "" }: { ficha: string; className?: string }) {
  const { enLinea, listo } = usePresencia();
  if (!listo) return null;
  const conectado = enLinea.has(ficha);
  return (
    <span
      title={conectado ? "Conectado" : "Desconectado"}
      className={`inline-flex shrink-0 items-center ${className}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          conectado ? "bg-green-500" : "bg-tinta-suave/40"
        }`}
      />
      <span className="sr-only">{conectado ? "Conectado" : "Desconectado"}</span>
    </span>
  );
}
