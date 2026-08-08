"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui/Boton";
import {
  desdeLasBlancas,
  lineaNumerada,
  porcentajeBarra,
  pvEnJugadas,
  textoPuntuacion,
  type Analisis as Evaluacion,
  type Puntuacion,
} from "@/lib/ajedrez/evaluacion";
import { Motor } from "@/lib/ajedrez/motor";

/** Hasta dónde piensa. 18 es una evaluación de sobra para revisar una partida de
 *  club y tarda poco; subirlo se nota en el móvil y no cambia el veredicto. */
const PROFUNDIDAD = 18;

export type EstadoAnalisis = "apagado" | "cargando" | "encendido" | "error";

/**
 * Enciende Stockfish y mantiene la evaluación de la posición que se está viendo.
 *
 * ES UN HOOK y no un componente porque lo que sale de aquí se pinta en DOS SITIOS
 * que no están juntos: la barra va pegada al tablero y el resto debajo de las
 * jugadas. Con un solo componente habría que elegir uno de los dos.
 *
 * SOLO EN EL REVISOR de partidas, por decisión del propietario: al meter una partida
 * en el tablero no hace falta que nadie te diga si la jugada era buena.
 */
export function useAnalisis(fen: string) {
  const [estado, setEstado] = useState<EstadoAnalisis>("apagado");
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const motor = useRef<Motor | null>(null);

  // Al salir de la pantalla se mata el Worker. Sin esto se queda un Stockfish
  // pensando en segundo plano y fundiendo la batería del teléfono.
  useEffect(() => {
    return () => motor.current?.cerrar();
  }, []);

  // Cada posición nueva se manda a analizar. La evaluación anterior se borra antes:
  // dejarla puesta mientras piensa enseña la nota de la jugada de antes como si
  // fuera la de esta.
  useEffect(() => {
    if (estado !== "encendido" || !motor.current) return;
    setEvaluacion(null);
    motor.current.analizar(fen, PROFUNDIDAD, setEvaluacion);
  }, [fen, estado]);

  const encender = useCallback(async () => {
    setEstado("cargando");
    try {
      const m = new Motor();
      await m.arrancar();
      motor.current = m;
      setEstado("encendido");
    } catch {
      setEstado("error");
    }
  }, []);

  const apagar = useCallback(() => {
    motor.current?.cerrar();
    motor.current = null;
    setEvaluacion(null);
    setEstado("apagado");
  }, []);

  const blancas: Puntuacion | null = evaluacion
    ? desdeLasBlancas(evaluacion.puntuacion, turnoDe(fen))
    : null;

  return { estado, evaluacion, blancas, encender, apagar };
}

/**
 * Barra de evaluación, en VERTICAL y al lado del tablero.
 *
 * GIRA CON EL TABLERO: abajo va siempre el color que se ve abajo, que es el del
 * socio que mira la partida. Es lo que hacen Lichess y Chess.com, y sin eso la barra
 * dice lo contrario de lo que parece cuando la partida se ve desde las negras.
 */
export function BarraEvaluacion({
  puntuacion,
  volteado,
}: {
  puntuacion: Puntuacion | null;
  volteado: boolean;
}) {
  const blanco = puntuacion ? porcentajeBarra(puntuacion) : 50;

  return (
    <div
      role="img"
      aria-label={
        puntuacion ? `Evaluación ${textoPuntuacion(puntuacion)}` : "Evaluación pendiente"
      }
      // El aro no es adorno: la parte de las blancas es casi del color del fondo
      // claro y sin él no se ve dónde acaba la barra.
      className="relative w-3 shrink-0 self-stretch overflow-hidden rounded-full bg-[#2a3f55] ring-1 ring-borde"
    >
      <div
        className={`absolute inset-x-0 bg-[#e9f2fb] transition-[height] duration-200 ${
          volteado ? "top-0" : "bottom-0"
        }`}
        style={{ height: `${blanco}%` }}
      />
    </div>
  );
}

/** El número, la profundidad y la línea que propone el motor. Va debajo, donde no
 *  estorba a quien solo quiere pasar las jugadas. */
export function PanelAnalisis({
  fen,
  estado,
  evaluacion,
  blancas,
  encender,
  apagar,
}: ReturnType<typeof useAnalisis> & { fen: string }) {
  if (estado === "apagado" || estado === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="secundario" className="px-3 py-1.5 text-sm" onClick={encender}>
          Analizar
        </Boton>
        <p className="text-xs text-tinta-suave">
          {estado === "error"
            ? "No se ha podido cargar el motor. Inténtalo otra vez."
            : "Stockfish, en tu navegador. La primera vez descarga 7 MB."}
        </p>
      </div>
    );
  }

  if (estado === "cargando") {
    return <p className="text-sm text-tinta-suave">Cargando el motor (7 MB)…</p>;
  }

  const jugadas = evaluacion ? pvEnJugadas(fen, evaluacion.pv) : [];

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold tabular-nums text-tinta">
          {blancas ? textoPuntuacion(blancas) : "…"}
        </span>
        {evaluacion && (
          <span className="text-xs text-tinta-suave">
            profundidad {evaluacion.profundidad}
          </span>
        )}
        <Boton
          variante="secundario"
          className="ml-auto px-3 py-1 text-xs"
          onClick={apagar}
        >
          Quitar el análisis
        </Boton>
      </div>

      {jugadas.length > 0 && (
        <p className="font-mono text-xs leading-5 text-tinta-suave">
          {lineaNumerada(jugadas, numeroJugadaDe(fen), turnoDe(fen))}
        </p>
      )}
    </div>
  );
}

/** El turno sale del propio FEN, que es la única fuente que no puede desincronizarse
 *  con la posición que se está analizando. */
function turnoDe(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function numeroJugadaDe(fen: string): number {
  return Number(fen.split(" ")[5]) || 1;
}
