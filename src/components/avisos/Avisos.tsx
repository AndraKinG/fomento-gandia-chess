"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { aceptarReto, rechazarReto } from "@/app/club/(vinculado)/jugar/actions";

/**
 * Avisos de la app, en una tarjeta que sale abajo.
 *
 * POR QUÉ EN EL LAYOUT Y NO EN LA PANTALLA DE JUGAR: los retos llegan cuando llegan.
 * Si el aviso solo existiera en `/club/jugar`, quien está mirando una partida, el
 * calendario o su perfil no se entera de que le han retado — que es justo lo que
 * pasaba. El push cubre el caso de tener la app cerrada; esto cubre el de estar
 * dentro pero en otra pantalla, que es el habitual.
 *
 * QUÉ AVISA:
 * - Te retan → tarjeta con Aceptar y No, gracias, sin salir de donde estás.
 * - Te aceptan → entra directo a la mesa.
 * - Te lo cancelan o rechazan → se dice, porque antes el reto desaparecía de la
 *   lista sin explicación y parecía que se hubiera perdido.
 *
 * ABAJO Y NO ARRIBA: en el móvil el pulgar vive abajo, y arriba está la cabecera.
 * Va por encima de la barra de navegación para no taparla.
 */

type Aviso =
  | { tipo: "reto"; id: string; de: string; cadencia: string }
  | { tipo: "info"; id: string; texto: string };

export function Avisos({ yo }: { yo: string }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  /** Retos que ya se han anunciado, para no repetir la tarjeta en cada repaso. */
  const vistos = useRef(new Set<string>());

  function quitar(id: string) {
    setAvisos((a) => a.filter((x) => x.id !== id));
  }

  useEffect(() => {
    let cerrar: (() => void) | null = null;
    let cancelado = false;

    /** Aviso que no hay que responder: se va solo, porque no hay nada que decidir
     *  y dejarlo puesto acaba tapando media pantalla. */
    function informar(id: string, texto: string) {
      setAvisos((a) => (a.some((x) => x.id === id) ? a : [...a, { tipo: "info", id, texto }]));
      // Cinco segundos: lo que pidió el propietario y lo que tarda en leerse una
      // línea sin que estorbe. Los que piden respuesta NO se van solos.
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000);
    }

    /** Mira si hay algo nuevo. Sirve de red de seguridad y de primer repaso. */
    async function repasar(supabase: Awaited<ReturnType<typeof clienteEnVivo>>["supabase"]) {
      const { data: paraMi } = await supabase
        .from("challenges")
        .select("id, base_min, incremento_s, reta_id, players:reta_id(nombre)")
        .eq("retado_id", yo)
        .eq("estado", "pendiente");

      for (const r of paraMi ?? []) {
        if (vistos.current.has(r.id)) continue;
        vistos.current.add(r.id);
        const de = (r.players as unknown as { nombre: string } | null)?.nombre ?? "Un socio";
        setAvisos((a) =>
          a.some((x) => x.id === r.id)
            ? a
            : [...a, { tipo: "reto", id: r.id, de, cadencia: `${r.base_min}+${r.incremento_s}` }]
        );
      }

      // Los que se han resuelto: se quita la tarjeta y se dice qué ha pasado.
      const idsEnPantalla = (paraMi ?? []).map((r) => r.id);
      setAvisos((a) =>
        a.filter((x) => x.tipo !== "reto" || idsEnPantalla.includes(x.id))
      );

      const { data: mios } = await supabase
        .from("challenges")
        .select("id, estado, live_game_id, players:retado_id(nombre)")
        .eq("reta_id", yo)
        .neq("estado", "pendiente")
        .order("creado_en", { ascending: false })
        .limit(3);

      for (const r of mios ?? []) {
        const clave = `${r.id}-${r.estado}`;
        if (vistos.current.has(clave)) continue;
        vistos.current.add(clave);
        const quien = (r.players as unknown as { nombre: string } | null)?.nombre ?? "Tu rival";
        if (r.estado === "aceptado" && r.live_game_id) {
          // Segundo cinturón: si ya estás en esa mesa, no hay a dónde llevarte.
          if (pathname !== `/club/jugar/${r.live_game_id}`) {
            router.push(`/club/jugar/${r.live_game_id}`);
          }
        } else if (r.estado === "rechazado") {
          informar(clave, `${quien} no acepta el reto.`);
        }
      }
    }

    /**
     * Repaso inicial SILENCIOSO: apunta como visto todo lo que ya había, sin
     * anunciar nada ni llevar a ninguna parte.
     *
     * ES IMPRESCINDIBLE PARA LOS RETOS YA ACEPTADOS, y costó verlo: al recargar la
     * página, `vistos` empieza vacío, así que el reto que aceptaste hace media hora
     * volvía a parecer nuevo y te metía en aquella partida —ya terminada, con su
     * ventana de resumen— como si acabara de pasar. Cada recarga, otra vez.
     */
    async function marcarLoQueYaHabia(
      supabase: Awaited<ReturnType<typeof clienteEnVivo>>["supabase"]
    ) {
      const [{ data: paraMi }, { data: mios }] = await Promise.all([
        supabase.from("challenges").select("id").eq("retado_id", yo).eq("estado", "pendiente"),
        supabase
          .from("challenges")
          .select("id, estado")
          .eq("reta_id", yo)
          .neq("estado", "pendiente")
          .order("creado_en", { ascending: false })
          .limit(10),
      ]);
      for (const r of paraMi ?? []) vistos.current.add(r.id);
      for (const r of mios ?? []) vistos.current.add(`${r.id}-${r.estado}`);
    }

    void clienteEnVivo().then(async ({ supabase }) => {
      if (cancelado) return;
      // Antes de escuchar nada: lo viejo es viejo.
      await marcarLoQueYaHabia(supabase);
      if (cancelado) return;

      const canal = supabase
        .channel(`avisos-${yo}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "challenges", filter: `retado_id=eq.${yo}` },
          () => void repasar(supabase)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "challenges", filter: `reta_id=eq.${yo}` },
          () => void repasar(supabase)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "challenges", filter: `retado_id=eq.${yo}` },
          () => void repasar(supabase)
        )
        .subscribe();

      // Red de seguridad, porque el tiempo real todavía no es de fiar. Cinco
      // segundos: esto no es una partida, un reto puede esperar.
      const reloj = setInterval(() => void repasar(supabase), 5000);

      cerrar = () => {
        clearInterval(reloj);
        void supabase.removeChannel(canal);
      };
    });

    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [pathname, router, yo]);

  if (avisos.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:right-6 lg:left-auto lg:items-end lg:px-0">
      {avisos.map((a) => (
        <div
          key={a.id}
          className="entra-abajo pointer-events-auto w-full max-w-sm rounded-2xl border border-borde-acento bg-tarjeta p-3 shadow-lg"
        >
          {a.tipo === "info" ? (
            <p className="text-sm text-tinta">{a.texto}</p>
          ) : (
            <>
              <p className="text-sm text-tinta">
                <b className="font-semibold">{a.de}</b> te reta a {a.cadencia}.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pendiente === a.id}
                  onClick={async () => {
                    setPendiente(a.id);
                    const r = await aceptarReto(a.id);
                    setPendiente(null);
                    quitar(a.id);
                    if (r.id) router.push(`/club/jugar/${r.id}`);
                  }}
                  className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-semibold text-sobre-acento disabled:opacity-50"
                >
                  Aceptar
                </button>
                <button
                  type="button"
                  disabled={pendiente === a.id}
                  onClick={async () => {
                    setPendiente(a.id);
                    await rechazarReto(a.id);
                    setPendiente(null);
                    quitar(a.id);
                  }}
                  className="rounded-xl border border-borde px-3 py-1.5 text-sm text-tinta disabled:opacity-50"
                >
                  No, gracias
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
