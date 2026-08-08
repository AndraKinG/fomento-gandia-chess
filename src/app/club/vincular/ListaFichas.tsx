"use client";

import { useMemo, useState, useTransition } from "react";
import { Banner } from "@/components/ui/Banner";
import { ChipElo } from "@/components/ui/ChipElo";
import { claveNombre } from "@/lib/import/cruzar-nombres";
import { inicioDelTrozo, partirEnDos } from "@/lib/ui/columnas";
import { solicitarVinculo } from "./actions";

/**
 * La lista de fichas libres, con buscador.
 *
 * EL BUSCADOR NO ES UN ADORNO: son 46 nombres y esta es la primera pantalla que ve
 * un socio nuevo, muchas veces desde el móvil. Sin él hay que ir bajando y leyendo
 * uno a uno, y el nombre está en el formato de la FACV ("Apellidos, Nombre"), que no
 * es como uno se busca a sí mismo.
 *
 * BUSCA POR PALABRAS SUELTAS Y SIN ACENTOS, con el mismo criterio que se usa para
 * cruzar nombres al importar: quien se llama "Martínez Ribes, Joan" se encuentra
 * escribiendo "joan", "ribes" o "joan ribes", en cualquier orden.
 */

export type Ficha = { id: string; nombre: string; elo: number | null };

export function ListaFichas({ fichas }: { fichas: Ficha[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // Se precalculan las palabras de cada nombre: filtrar en cada tecla no puede
  // rehacer el trabajo de normalizar 46 nombres.
  const conClave = useMemo(
    () => fichas.map((f) => ({ ...f, palabras: claveNombre(f.nombre).split(" ") })),
    [fichas]
  );

  const visibles = useMemo(() => {
    const pedido = claveNombre(busqueda).split(" ").filter(Boolean);
    if (pedido.length === 0) return conClave;
    // Todas las palabras escritas tienen que aparecer, aunque sea a medias: así
    // "jo rib" encuentra a "Joan Ribes" sin obligar a escribirlo entero.
    return conClave.filter((f) =>
      pedido.every((p) => f.palabras.some((w) => w.startsWith(p)))
    );
  }, [conClave, busqueda]);

  const trozos = partirEnDos(visibles);

  function pedir(id: string) {
    setError(null);
    empezar(async () => {
      const r = await solicitarVinculo(id);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="space-y-3">
      {error && <Banner tipo="error">{error}</Banner>}

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Escribe tu nombre o tu apellido…"
        autoComplete="off"
        className="w-full rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
      />

      {visibles.length === 0 ? (
        <p className="px-1 text-sm text-tinta-suave">
          Ningún nombre cuadra con «{busqueda}».
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {trozos.map((trozo, n) => (
            <div
              key={n}
              className="overflow-hidden rounded-2xl border border-borde bg-tarjeta"
            >
              <ul className="divide-y divide-borde">
                {trozo.map((f, i) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="w-6 shrink-0 text-xs tabular-nums text-tinta-suave">
                      {inicioDelTrozo(trozos, n) + i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                      {f.nombre}
                    </span>
                    <span className="shrink-0">
                      <ChipElo valor={f.elo} etiqueta="FACV" />
                    </span>
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => pedir(f.id)}
                      className="shrink-0 rounded-lg bg-acento-fuerte px-3 py-1 text-xs font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                    >
                      Soy yo
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 text-xs text-tinta-suave">
        {visibles.length} de {fichas.length} fichas libres.
      </p>
    </div>
  );
}
