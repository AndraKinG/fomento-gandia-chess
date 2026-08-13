"use client";

import { useEffect, useRef, useState } from "react";
import { PanelAnalisis, useAnalisis } from "@/components/ajedrez/Analisis";
import { activarMotor } from "@/app/club/(vinculado)/jugar/actions";

/**
 * Stockfish sugiriendo jugadas DENTRO de una partida en curso.
 *
 * QUÉ ES: una broma del propietario para vacilar a algún colega en una partida de reto
 * y contárselo después. No es una función del club. Está atada por todos lados:
 *
 * - **Una sola ficha**, la de `FICHA_CON_MOTOR` en el servidor. No es "ser admin": lo
 *   pidió así ("aunque haya más admins, solo yo"), y además un permiso ligado al rango
 *   se heredaría solo el día que nombre a alguien.
 * - **Solo en retos.** En un torneo interno hay clasificación, así que ahí no es una
 *   broma. Lo comprueban el servidor y un CHECK de la base (migración 0044).
 * - **Solo jugando**, no de espectador.
 * - **Encenderlo deja marca para siempre.** Apagar aquí deja de pedirle jugadas, pero
 *   la partida ya dice que se jugó con motor y lo cuenta al terminar, a los dos. Eso es
 *   lo que hace que esto sea un vacile con final y no otra cosa: el "luego se lo digo"
 *   deja de depender de acordarse.
 *
 * SE CARGA A MANO, como en el revisor: son 7 MB de motor y no se le gastan a nadie sin
 * que los pida (ver la cabecera de `motor.ts`).
 */
export function PanelMotor({
  partidaId,
  fen,
  yaMarcado,
}: {
  partidaId: string;
  fen: string;
  /** La partida ya está marcada: encender otra vez no cambia nada en la base. */
  yaMarcado: boolean;
}) {
  const { estado, evaluacion, blancas, encender, apagar } = useAnalisis(fen);
  const [error, setError] = useState<string | null>(null);
  /** Para no repetir el aviso al servidor cada vez que se enciende. */
  const marcado = useRef(yaMarcado);

  // La marca se pide al ENCENDER y una sola vez. Va en un efecto y no en el `onClick`
  // porque `encender()` es asíncrono: si el motor no llega a arrancar (móvil sin
  // memoria, red caída) no se ha jugado con motor y no hay nada que marcar.
  useEffect(() => {
    if (estado !== "encendido" || marcado.current) return;
    marcado.current = true;
    void activarMotor(partidaId).then((r) => {
      if (r.error) setError(r.error);
    });
  }, [estado, partidaId]);

  return (
    <div className="rounded-2xl border border-dashed border-borde bg-tarjeta p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
          🤖 Motor
        </span>
        <button
          type="button"
          onClick={() => (estado === "encendido" ? apagar() : void encender())}
          disabled={estado === "cargando"}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-50 ${
            estado === "encendido"
              ? "bg-acento-fuerte text-sobre-acento"
              : "border border-borde bg-tarjeta text-tinta-suave"
          }`}
        >
          {estado === "cargando"
            ? "Cargando…"
            : estado === "encendido"
              ? "Apagar"
              : "Encender"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-tinta-suave">{error}</p>}

      {/* El MISMO panel que el revisor de partidas: la puntuación y la línea que
          propone el motor, ya numeradas. Repetir aquí ese formateo era garantizar que
          dentro de un mes los dos sitios enseñaran la línea de forma distinta. */}
      <div className="mt-2">
        <PanelAnalisis fen={fen} estado={estado} evaluacion={evaluacion} blancas={blancas} />
      </div>

      {/* Se dice aquí, para que no haya sorpresa después. */}
      <p className="mt-2 text-[0.65rem] leading-tight text-tinta-suave">
        Al terminar, la partida dirá que se ha jugado con motor. Apagarlo no quita esa
        marca.
      </p>
    </div>
  );
}
