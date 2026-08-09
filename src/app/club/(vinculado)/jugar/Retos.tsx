"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { PuntoConectado, usePresencia } from "@/components/presencia/Presencia";
import { claveNombre } from "@/lib/import/cruzar-nombres";
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
  const [busca, setBusca] = useState("");
  const [cadencia, setCadencia] = useState(CADENCIAS[1]);
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
   * LOS RETOS, EN VIVO, POR LOS DOS LADOS.
   *
   * - A QUIEN RETA: en cuanto el otro acepta, se entra directo en la partida. Antes
   *   se quedaba mirando la pantalla mientras el rival ya esperaba en el tablero.
   * - A QUIEN LO RECIBE: el reto aparece solo. Antes había que recargar para verlo,
   *   que es justo lo contrario de retar a alguien que está conectado.
   *
   * Con reintento cada tres segundos por si el aviso se pierde: llegar tarde aquí es
   * llegar tarde a tu propia partida.
   */
  useEffect(() => {
    const mios = mandados.map((r) => r.id);

    let cerrar: (() => void) | null = null;
    let cancelado = false;

    function alAceptar(idPartida: string | null) {
      if (idPartida) router.push(`/club/jugar/${idPartida}`);
      else router.refresh();
    }

    void clienteEnVivo().then(({ supabase }) => {
      if (cancelado) return;
      const canal = supabase
        .channel(`retos-${yo}`)
        // Los que mando yo: me interesa cuándo los aceptan.
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "challenges", filter: `reta_id=eq.${yo}` },
          (aviso) => {
            const f = aviso.new as { estado?: string; live_game_id?: string | null };
            if (f.estado === "aceptado") alAceptar(f.live_game_id ?? null);
            else router.refresh();
          }
        )
        // Los que me mandan a mí: me interesa que aparezcan sin recargar.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "challenges", filter: `retado_id=eq.${yo}` },
          () => router.refresh()
        )
        .subscribe();
      cerrar = () => void supabase.removeChannel(canal);

      // La red de seguridad mira las dos cosas: si me han aceptado alguno, y si ha
      // entrado alguno nuevo para mí.
      const reloj = setInterval(async () => {
        if (mios.length > 0) {
          const { data } = await supabase
            .from("challenges")
            .select("estado, live_game_id")
            .in("id", mios)
            .neq("estado", "pendiente");
          const aceptado = (data ?? []).find((r) => r.estado === "aceptado");
          if (aceptado) {
            alAceptar(aceptado.live_game_id ?? null);
            return;
          }
          if ((data ?? []).length > 0) {
            router.refresh();
            return;
          }
        }
        const { count } = await supabase
          .from("challenges")
          .select("id", { count: "exact", head: true })
          .eq("retado_id", yo)
          .eq("estado", "pendiente");
        if ((count ?? 0) !== recibidos.length) router.refresh();
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
  }, [mandados, recibidos.length, router, yo]);

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
