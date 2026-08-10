"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { PuntoConectado, usePresencia } from "@/components/presencia/Presencia";
import { claveNombre } from "@/lib/import/cruzar-nombres";
import { aceptarReto, rechazarReto, retar } from "./actions";
import { ElegirCadencia, type Cadencia } from "@/components/ajedrez/Cadencia";

/**
 * Los retos: los que te han mandado, los que has mandado tú, y el formulario.
 *
 * La cadencia se elige con el selector compartido (`ElegirCadencia`): las tres
 * de siempre como botones y "Otra" para ponerla a mano — petición del
 * propietario del 2026-08-10, para las lentas del club que no están en la lista.
 */

/**
 * Qué se pidió de color, dicho desde el lado que lo lee.
 *
 * Se enseña aunque no cambie nada de lo que puedes hacer: aceptar un reto sin saber
 * si el color está echado o se sortea es aceptarlo a ciegas, y quien reta también
 * quiere ver que su elección se ha guardado.
 */
function colorPedido(color: string, esMio: boolean): string {
  if (color === "blancas") return esMio ? "pides blancas" : "Quiere llevar blancas.";
  if (color === "negras") return esMio ? "pides negras" : "Quiere llevar negras.";
  return esMio ? "color al azar" : "El color se sortea.";
}

export type RetoVista = {
  id: string;
  retaId: string;
  retadoId: string;
  retaNombre: string;
  retadoNombre: string;
  baseMin: number;
  incrementoS: number;
  color: string;
};

export function Retos({
  yo,
  retos,
  socios,
}: {
  yo: string;
  retos: RetoVista[];
  socios: { id: string; nombre: string }[];
}) {
  const [aQuien, setAQuien] = useState("");
  const [busca, setBusca] = useState("");
  const [cadencia, setCadencia] = useState<Cadencia>({ baseMin: 5, incrementoS: 3 });
  const [color, setColor] = useState("azar");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const { enLinea } = usePresencia();

  // LOS CONECTADOS PRIMERO. Una partida en vivo con alguien que no está delante no
  // empieza nunca, así que la lista se ordena por quién puede aceptar ahora mismo.
  const ordenados = [...socios].sort((a, b) => {
    const conectado = Number(enLinea.has(b.id)) - Number(enLinea.has(a.id));
    return conectado !== 0 ? conectado : a.nombre.localeCompare(b.nombre, "es");
  });

  // EL BUSCADOR SOLO CUANDO HACE FALTA. Con cuatro socios registrados estorba; con
  // los 46 del club, bajar la lista buscando un nombre es peor que escribirlo. El
  // corte está donde la lista deja de verse de un vistazo.
  const conBuscador = socios.length > 8;
  const pedido = claveNombre(busca).split(" ").filter(Boolean);
  const porRetar =
    pedido.length === 0
      ? ordenados
      : ordenados.filter((s) => {
          const palabras = claveNombre(s.nombre).split(" ");
          return pedido.every((q) => palabras.some((w) => w.startsWith(q)));
        });

  const recibidos = retos.filter((r) => r.retadoId === yo);
  const mandados = retos.filter((r) => r.retaId === yo);

  /**
   * NO HAY TIEMPO REAL AQUÍ, y es a propósito.
   *
   * Antes esta pantalla abría su propio canal y su propio reintento, en paralelo a
   * los de `Avisos` —que está montado en el layout y por tanto también aquí—. Dos
   * sitios escuchando lo mismo es el doble de consultas y una carrera para ver quién
   * te lleva antes a la partida. Ahora manda `Avisos`: entra directo al aceptar y
   * refresca esta pantalla cuando algo cambia.
   */

  function ejecutar(accion: () => Promise<{ error?: string; id?: string }>, aPartida = false) {
    setError(null);
    empezar(async () => {
      const r = await accion();
      if (r.error) {
        setError(r.error);
        return;
      }
      // Al aceptar se entra directo a la mesa: el rival ya está esperando y el
      // reloj no arranca hasta la primera jugada, pero nadie quiere buscarla.
      if (aPartida && r.id) router.push(`/club/jugar/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
        Retos
      </h2>

      {error && <Banner tipo="error">{error}</Banner>}

      {recibidos.map((r) => (
        <Tarjeta key={r.id} destacada compacta>
          <p className="text-sm text-tinta">
            <span className="font-semibold">{r.retaNombre}</span> te reta a{" "}
            {r.baseMin}+{r.incrementoS}.
          </p>
          <p className="text-xs text-tinta-suave">{colorPedido(r.color, false)}</p>
          <div className="mt-2 flex gap-2">
            <Boton
              variante="solido"
              className="px-3 py-1.5 text-sm"
              disabled={pendiente}
              onClick={() => ejecutar(() => aceptarReto(r.id), true)}
            >
              Aceptar
            </Boton>
            <Boton
              variante="secundario"
              className="px-3 py-1.5 text-sm"
              disabled={pendiente}
              onClick={() => ejecutar(() => rechazarReto(r.id))}
            >
              No, gracias
            </Boton>
          </div>
        </Tarjeta>
      ))}

      {mandados.map((r) => (
        <Tarjeta key={r.id} compacta>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-tinta-suave">
              Esperando a {r.retadoNombre} · {r.baseMin}+{r.incrementoS} ·{" "}
              {colorPedido(r.color, true)}
            </p>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(() => rechazarReto(r.id))}
              className="shrink-0 text-xs text-acento-texto underline"
            >
              Cancelar
            </button>
          </div>
        </Tarjeta>
      ))}

      <Tarjeta compacta>
        <div className="space-y-2">
          {/* LISTA Y NO UN DESPLEGABLE, ahora que hay círculo de conectado: dentro
              de un `select` no se puede pintar nada, y saber quién está delante es
              justo lo que decide a quién retas. */}
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            ¿A quién retas?
          </p>
          {conBuscador && (
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nombre…"
              autoComplete="off"
              className="w-full rounded-xl border border-borde bg-tarjeta px-3 py-2 text-sm text-tinta placeholder:text-tinta-suave"
            />
          )}
          {porRetar.length === 0 ? (
            <p className="text-sm text-tinta-suave">
              {socios.length === 0
                ? "Todavía no hay ningún otro socio con cuenta en la app."
                : `Ningún nombre cuadra con «${busca}».`}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {porRetar.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setAQuien(s.id === aQuien ? "" : s.id)}
                    aria-pressed={aQuien === s.id}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                      aQuien === s.id
                        ? "bg-acento-fuerte text-sobre-acento"
                        : "text-tinta hover:bg-tarjeta-suave"
                    }`}
                  >
                    <PuntoConectado ficha={s.id} />
                    <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <ElegirCadencia valor={cadencia} onCambiar={setCadencia} />
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="rounded-lg border border-borde bg-tarjeta px-2 py-1.5 text-sm text-tinta"
            >
              <option value="azar">Color: alterna</option>
              <option value="blancas">Yo, blancas</option>
              <option value="negras">Yo, negras</option>
            </select>
          </div>

          <Boton
            variante="degradado"
            className="w-full text-sm"
            disabled={pendiente || aQuien === ""}
            onClick={() =>
              ejecutar(() =>
                retar({
                  aQuien,
                  baseMin: cadencia.baseMin,
                  incrementoS: cadencia.incrementoS,
                  color,
                })
              )
            }
          >
            {pendiente ? "Mandando…" : "Retar"}
          </Boton>
          <p className="text-xs text-tinta-suave">
            Con &laquo;alterna&raquo;, la primera vez que jugáis se sortea el color y a
            partir de ahí va cambiando.
          </p>
        </div>
      </Tarjeta>
    </section>
  );
}
