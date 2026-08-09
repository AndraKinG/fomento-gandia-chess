"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { aceptarReto, rechazarReto, retar } from "./actions";

/**
 * Los retos: los que te han mandado, los que has mandado tú, y el formulario.
 *
 * LAS CADENCIAS SON BOTONES Y NO UN CAMPO LIBRE. Nadie escribe "7+2": se juega a lo
 * de siempre, y tres botones se tocan en un segundo desde el móvil. El servidor
 * admite cualquier valor razonable por si algún día hace falta.
 */

const CADENCIAS = [
  { etiqueta: "3+2", baseMin: 3, incrementoS: 2 },
  { etiqueta: "5+3", baseMin: 5, incrementoS: 3 },
  { etiqueta: "10+5", baseMin: 10, incrementoS: 5 },
];

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
  const [cadencia, setCadencia] = useState(CADENCIAS[1]);
  const [color, setColor] = useState("azar");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();

  const recibidos = retos.filter((r) => r.retadoId === yo);
  const mandados = retos.filter((r) => r.retaId === yo);

  /**
   * QUE TE ACEPTEN EL RETO TE METE EN LA PARTIDA.
   *
   * Antes no pasaba nada: quien retaba se quedaba mirando la pantalla y tenía que
   * recargar para enterarse de que el otro ya estaba esperando en el tablero, con
   * el reloj a punto de arrancar. Ahora se escucha el reto y en cuanto pasa a
   * aceptado se entra solo.
   *
   * Con reintento cada tres segundos por si el aviso se pierde: enterarte tarde de
   * esto es llegar tarde a tu propia partida.
   */
  useEffect(() => {
    const pendientesMios = mandados.map((r) => r.id);
    if (pendientesMios.length === 0) return;

    let cerrar: (() => void) | null = null;
    let cancelado = false;

    async function alAceptar(idPartida: string | null) {
      if (idPartida) router.push(`/club/jugar/${idPartida}`);
      else router.refresh();
    }

    void clienteEnVivo().then(({ supabase }) => {
      if (cancelado) return;
      const canal = supabase
        .channel(`retos-${yo}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "challenges", filter: `reta_id=eq.${yo}` },
          (aviso) => {
            const f = aviso.new as { estado?: string; live_game_id?: string | null };
            if (f.estado === "aceptado") void alAceptar(f.live_game_id ?? null);
            else router.refresh();
          }
        )
        .subscribe();
      cerrar = () => void supabase.removeChannel(canal);

      const reloj = setInterval(async () => {
        const { data } = await supabase
          .from("challenges")
          .select("estado, live_game_id")
          .in("id", pendientesMios)
          .neq("estado", "pendiente");
        const aceptado = (data ?? []).find((r) => r.estado === "aceptado");
        if (aceptado) void alAceptar(aceptado.live_game_id ?? null);
        else if ((data ?? []).length > 0) router.refresh();
      }, 3000);
      const anterior = cerrar;
      cerrar = () => {
        clearInterval(reloj);
        anterior?.();
      };
    });

    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [mandados, router, yo]);

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
              Esperando a {r.retadoNombre} · {r.baseMin}+{r.incrementoS}
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
          <select
            value={aQuien}
            onChange={(e) => setAQuien(e.target.value)}
            className="w-full rounded-xl border border-borde bg-tarjeta p-2.5 text-sm text-tinta"
          >
            <option value="">¿A quién retas?</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1.5">
            {CADENCIAS.map((c) => (
              <button
                key={c.etiqueta}
                type="button"
                onClick={() => setCadencia(c)}
                aria-pressed={cadencia.etiqueta === c.etiqueta}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-100 ${
                  cadencia.etiqueta === c.etiqueta
                    ? "bg-acento-fuerte text-sobre-acento"
                    : "border border-borde bg-tarjeta text-tinta-suave"
                }`}
              >
                {c.etiqueta}
              </button>
            ))}
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
