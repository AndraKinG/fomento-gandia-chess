"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { aceptarReto, rechazarReto } from "@/app/club/(vinculado)/jugar/actions";
import { usePendientes } from "./Pendientes";

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
 * POR DIFUSIÓN, NO ESCUCHANDO LA TABLA. La primera versión escuchaba `challenges`
 * con `postgres_changes` y no llegaba nada: aplica la RLS al que escucha y algo de
 * nuestras políticas lo dejaba fuera, así que todo se sostenía con el repaso cada
 * cinco segundos — de ahí que aceptar un reto tardara en meter al otro en la partida
 * y que el número rojo apareciera tarde. Ahora el servidor manda un mensaje al canal
 * `avisos-<ficha>` y el repaso se queda de red de seguridad.
 *
 * LAS TARJETAS SE VAN SOLAS a los cinco segundos, también las que traen botones: lo
 * que queda de un reto sin contestar es el número rojo del menú, y desde ahí se
 * llega a Jugar, que es donde vive la lista entera.
 *
 * ABAJO Y NO ARRIBA: en el móvil el pulgar vive abajo, y arriba está la cabecera.
 * Va por encima de la barra de navegación para no taparla.
 *
 * EL NÚMERO ROJO DEL MENÚ SUMA DOS COSAS QUE NO SE PARECEN: retos pendientes
 * (esta tabla, `challenges`) y avisos sin leer (tabla `notifications`, la
 * bandeja de `/club/avisos`). "Te han retado" NO es ningún tipo de aviso de esa
 * tabla —el único tipo de partidas que hay ahí es `reto_aceptado`, y ese va a
 * QUIEN retó, no a quien recibe el reto—, así que si el número solo contara
 * avisos sin leer, un reto recibido no movería nada: sería una regresión de un
 * flujo que hoy ya funciona y está probado. La suma se hace AQUÍ, en `repasar()`,
 * y TAMBIÉN en el valor de partida del layout (`src/app/club/layout.tsx`), con
 * la misma fórmula en los dos sitios para que nunca puedan discrepar.
 */

type Aviso =
  | { tipo: "reto"; id: string; de: string; cadencia: string; color: string }
  | { tipo: "info"; id: string; texto: string };

/** Lo que pidió quien reta, dicho para quien lo recibe. */
function textoColor(color: string): string {
  if (color === "blancas") return "Quiere llevar blancas.";
  if (color === "negras") return "Quiere llevar negras.";
  return "El color se sortea.";
}

export function Avisos({ yo, perfilId }: { yo: string; perfilId: string }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { poner } = usePendientes();
  /** Retos que ya se han anunciado, para no repetir la tarjeta en cada repaso. */
  const vistos = useRef(new Set<string>());
  /** Los que estaban esperando respuesta en el repaso anterior. Sirve para notar
   *  que uno HA DEJADO de estar: cancelarlo no crea nada nuevo que mirar. */
  const esperando = useRef<string[]>([]);

  /**
   * Lo que cambia y no debe volver a montar el canal.
   *
   * El canal se abre UNA VEZ por sesión: tenerlo colgando de `pathname` lo cerraba y
   * lo volvía a abrir en cada navegación, y en esos milisegundos de reconexión es
   * cuando se pierde justo el aviso que importa.
   */
  const donde = useRef(pathname);
  const ir = useRef(router);
  const anotar = useRef(poner);
  useEffect(() => {
    donde.current = pathname;
    ir.current = router;
    anotar.current = poner;
  }, [pathname, router, poner]);

  function quitar(id: string) {
    setAvisos((a) => a.filter((x) => x.id !== id));
  }

  useEffect(() => {
    let cerrar: (() => void) | null = null;
    let cancelado = false;

    /** Un aviso dura cinco segundos: lo que se tarda en leer una línea sin que
     *  estorbe. Lo que tenga que quedar, queda en el menú y en Jugar. */
    function seVaSolo(id: string) {
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000);
    }

    function informar(id: string, texto: string) {
      setAvisos((a) => (a.some((x) => x.id === id) ? a : [...a, { tipo: "info", id, texto }]));
      seVaSolo(id);
    }

    /** Mira si hay algo nuevo. Sirve de red de seguridad y de primer repaso. */
    async function repasar(supabase: Awaited<ReturnType<typeof clienteEnVivo>>["supabase"]) {
      const [{ data: paraMi }, { count: sinLeer }] = await Promise.all([
        supabase
          .from("challenges")
          .select("id, base_min, incremento_s, color, reta_id, players:reta_id(nombre)")
          .eq("retado_id", yo)
          .eq("estado", "pendiente"),
        // `notifications.profile_id` es el id de la CUENTA, no el de la ficha:
        // por eso esta consulta usa `perfilId` y no `yo`. Ver cabecera del
        // fichero: el número rojo del menú es la suma de esto y los retos.
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", perfilId)
          .is("leido_en", null),
      ]);

      // El número rojo del menú sale de aquí: es la misma suma que calcula el
      // layout como valor de partida, así que no puede discrepar de las
      // tarjetas ni de la bandeja de `/club/avisos`.
      anotar.current((paraMi ?? []).length + (sinLeer ?? 0));

      // NOVEDAD ES TAMBIÉN QUE ALGO DESAPAREZCA, y esto es lo que faltaba: al
      // cancelar un reto, al retado le llegaba el mensaje pero la tarjeta de la
      // pantalla de Jugar seguía ahí con su botón de Aceptar, que ya no valía para
      // nada —contestaba "ese reto ya está resuelto"—. Comparar contra el repaso
      // anterior lo cubre en los dos sentidos.
      const ahoraEsperan = (paraMi ?? []).map((r) => r.id);
      let novedad =
        ahoraEsperan.length !== esperando.current.length ||
        ahoraEsperan.some((id) => !esperando.current.includes(id));
      esperando.current = ahoraEsperan;

      for (const r of paraMi ?? []) {
        if (vistos.current.has(r.id)) continue;
        vistos.current.add(r.id);
        const de = (r.players as unknown as { nombre: string } | null)?.nombre ?? "Un socio";
        setAvisos((a) =>
          a.some((x) => x.id === r.id)
            ? a
            : [
                ...a,
                {
                  tipo: "reto",
                  id: r.id,
                  de,
                  cadencia: `${r.base_min}+${r.incremento_s}`,
                  color: r.color as string,
                },
              ]
        );
        seVaSolo(r.id);
      }

      // Los que se han resuelto: se quita la tarjeta, que ya no lleva a ninguna parte.
      setAvisos((a) => a.filter((x) => x.tipo !== "reto" || ahoraEsperan.includes(x.id)));

      // LOS QUE ME MANDARON A MÍ Y SE HAN CANCELADO. Sin esto el reto desaparecía de
      // la pantalla sin una palabra: quien lo mandó sabe que lo ha cancelado, pero
      // quien lo tenía delante solo veía esfumarse la tarjeta.
      const { data: cancelados } = await supabase
        .from("challenges")
        .select("id, estado, players:reta_id(nombre)")
        .eq("retado_id", yo)
        .eq("estado", "cancelado")
        .order("creado_en", { ascending: false })
        .limit(3);

      for (const r of cancelados ?? []) {
        const clave = `${r.id}-cancelado`;
        if (vistos.current.has(clave)) continue;
        vistos.current.add(clave);
        const quien = (r.players as unknown as { nombre: string } | null)?.nombre ?? "Un socio";
        informar(clave, `${quien} ha retirado su reto.`);
      }

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
        novedad = true;
        const quien = (r.players as unknown as { nombre: string } | null)?.nombre ?? "Tu rival";
        if (r.estado === "aceptado" && r.live_game_id) {
          // Segundo cinturón: si ya estás en esa mesa, no hay a dónde llevarte.
          if (donde.current !== `/club/jugar/${r.live_game_id}`) {
            ir.current.push(`/club/jugar/${r.live_game_id}`);
          }
        } else if (r.estado === "rechazado") {
          informar(clave, `${quien} no acepta el reto.`);
        }
      }

      // La pantalla de Jugar tiene sus propias listas y las pinta el servidor: si ha
      // cambiado algo, hay que rehacerlas. Solo cuando hay novedad de verdad, que
      // esto rehace la página entera.
      if (novedad && donde.current === "/club/jugar") ir.current.refresh();
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
        supabase
          .from("challenges")
          .select("id, estado")
          .eq("retado_id", yo)
          .in("estado", ["pendiente", "cancelado"]),
        supabase
          .from("challenges")
          .select("id, estado")
          .eq("reta_id", yo)
          .neq("estado", "pendiente")
          .order("creado_en", { ascending: false })
          .limit(10),
      ]);
      for (const r of paraMi ?? []) {
        vistos.current.add(r.estado === "cancelado" ? `${r.id}-cancelado` : r.id);
      }
      esperando.current = (paraMi ?? []).filter((r) => r.estado === "pendiente").map((r) => r.id);
      for (const r of mios ?? []) vistos.current.add(`${r.id}-${r.estado}`);
    }

    void clienteEnVivo().then(async ({ supabase }) => {
      if (cancelado) return;
      // Antes de escuchar nada: lo viejo es viejo.
      await marcarLoQueYaHabia(supabase);
      if (cancelado) return;

      const canal = supabase
        .channel(`avisos-${yo}`)
        .on("broadcast", { event: "reto" }, (aviso) => {
          const p = (aviso.payload ?? {}) as { que?: string; partidaId?: string };
          // Al reto aceptado se va sin pasar por la consulta: el dato ya viene en el
          // aviso y lo que sobra aquí es precisamente ir y volver a la base.
          if (p.que === "aceptado" && p.partidaId) {
            if (donde.current !== `/club/jugar/${p.partidaId}`) {
              ir.current.push(`/club/jugar/${p.partidaId}`);
            }
            return;
          }
          void repasar(supabase);
        })
        .subscribe();

      // Red de seguridad: si un aviso se pierde, esto lo recoge. Cinco segundos, que
      // un reto puede esperar; lo que no puede es no llegar nunca.
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
  }, [yo, perfilId]);

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
              <p className="text-xs text-tinta-suave">{textoColor(a.color)}</p>
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
