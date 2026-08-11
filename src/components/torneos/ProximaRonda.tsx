"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { jugarEmparejamiento } from "@/app/club/(vinculado)/jugar/actions";
import { useEnPartida } from "@/components/avisos/EnPartida";
import {
  minutosHasta,
  textoCuentaAtras,
  tocaLaTarjeta,
  horaCorta,
} from "@/lib/torneos/hora-de-ronda";
import type { ProximaRondaVista } from "@/lib/torneos/proxima-ronda";

/**
 * "Tu ronda empieza a las 19:00": la mitad de dentro de la app del aviso de ronda.
 *
 * POR QUÉ HACEN FALTA LAS DOS MITADES. El push (`/api/cron/rondas`) cubre tener la
 * app cerrada, pero no llega si el socio no ha instalado la app —en iPhone no hay
 * push sin instalar— o si silenció los torneos. Esta tarjeta cubre el caso contrario
 * y el más normal: estar dentro de la app y que se te pase la hora.
 *
 * LA CUENTA ATRÁS LA HACE EL NAVEGADOR. El servidor solo dice "tienes esta ronda a
 * esta hora" (ver `leerProximaRonda`, que la devuelve desde bastante antes); la
 * tarjeta aparece sola cuando falta una hora, sin ir a la base y sin recargar. Si lo
 * decidiera el servidor, quien deja la app abierta un rato no vería nada nunca: su
 * página se pintó cuando todavía faltaba mucho.
 *
 * BANNER EN EL FLUJO Y NO TARJETA FLOTANTE: no es un aviso de paso como los de
 * `Avisos.tsx` (cinco segundos y se va), es un recordatorio que tiene que seguir ahí
 * media hora. Flotando abajo se pelearía con la barra de navegación y con esas
 * tarjetas; aquí empuja la pantalla un poco y no tapa nada.
 *
 * CON UNA PARTIDA DELANTE, NO: mismo criterio que las tarjetas de aviso (ver
 * `EnPartida.tsx`). Jugando, lo último que hace falta es que se mueva el tablero.
 */

/** Cada cuánto se mira el reloj. Medio minuto: la cuenta atrás va en minutos. */
const TICK_MS = 30_000;

const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

function suscribirse(avisar: () => void): () => void {
  oyentes.add(avisar);
  if (!reloj) {
    reloj = setInterval(() => {
      for (const o of oyentes) o();
    }, TICK_MS);
  }
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  };
}

/** El minuto actual. Entero a propósito: `useSyncExternalStore` exige que dos
 *  lecturas seguidas den lo mismo, y `Date.now()` cambia en cada milisegundo. */
function minutoActual(): number {
  return Math.floor(Date.now() / 60_000);
}

/** En el servidor no hay reloj del socio: el minuto 0 (1970) deja la tarjeta
 *  fuera de toda ventana, así que el HTML del servidor no la trae y no puede
 *  parpadear ni descuadrar la hidratación. */
function enElServidor(): number {
  return 0;
}

/** Cerradas a mano en esta sesión, para que no vuelvan en cada navegación. */
const cerradas = new Set<string>();

export function ProximaRonda({ ronda }: { ronda: ProximaRondaVista | null }) {
  const minuto = useSyncExternalStore(suscribirse, minutoActual, enElServidor);
  const [cerrada, setCerrada] = useState(() => cerradas.has(ronda?.pairingId ?? ""));
  const [pendiente, startTransition] = useTransition();
  const { enPartida } = useEnPartida();
  const router = useRouter();

  if (!ronda || cerrada || enPartida) return null;

  const ahora = new Date(minuto * 60_000);
  if (!tocaLaTarjeta(ronda.fechaHora, ahora)) return null;

  const faltan = minutosHasta(ronda.fechaHora, ahora);

  return (
    <div className="px-3 pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-borde-acento bg-tarjeta p-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-tinta">
            Ronda {ronda.numero} a las {horaCorta(ronda.fechaHora)}
          </p>
          <p className="truncate text-xs text-tinta-suave">
            {textoCuentaAtras(faltan)} · contra {ronda.rival}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const r = await jugarEmparejamiento(ronda.pairingId);
                if (r.id) router.push(`/club/jugar/${r.id}`);
                // Sin `id` es que no se pudo abrir la mesa (la partida ya tiene
                // resultado, el torneo se cerró...). No se enseña el error aquí:
                // el enlace de al lado lleva al torneo, que lo explica en su sitio.
              })
            }
            className="rounded-xl bg-acento-fuerte px-3 py-1.5 text-sm font-semibold text-sobre-acento transition duration-100 active:scale-[0.97] disabled:opacity-50"
          >
            {pendiente ? "Abriendo…" : "Ir a la partida"}
          </button>
          <Link
            href={`/club/jugar/torneos/${ronda.torneoId}`}
            className="text-xs text-acento-texto underline"
          >
            El torneo
          </Link>
          <button
            type="button"
            aria-label="Quitar el aviso"
            onClick={() => {
              cerradas.add(ronda.pairingId);
              setCerrada(true);
            }}
            className="px-1 text-lg leading-none text-tinta-suave"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
