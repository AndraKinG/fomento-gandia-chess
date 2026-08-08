"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui/Boton";
import {
  desdeLasBlancas,
  lineaNumerada,
  porcentajeBarra,
  pvEnJugadas,
  textoPuntuacion,
  type Analisis as Evaluacion,
} from "@/lib/ajedrez/evaluacion";
import { Motor } from "@/lib/ajedrez/motor";

/** Hasta dónde piensa. 18 es una evaluación de sobra para revisar una partida de
 *  club y tarda poco; subirlo se nota en el móvil y no cambia el veredicto. */
const PROFUNDIDAD = 18;

type Estado = "apagado" | "cargando" | "encendido" | "error";

/**
 * Analiza la posición que se está viendo, con Stockfish dentro del navegador.
 *
 * SOLO EN EL REVISOR de partidas, por decisión del propietario: al meter una partida
 * en el tablero no hace falta que nadie te diga si la jugada era buena.
 *
 * El motor se enciende A MANO. Son 7 MB de WebAssembly, y no se le gastan a nadie
 * por abrir una partida; una vez cargado, el navegador lo guarda y las siguientes
 * veces es instantáneo.
 */
export function Analisis({ fen }: { fen: string }) {
  const [estado, setEstado] = useState<Estado>("apagado");
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

  async function encender() {
    setEstado("cargando");
    try {
      const m = new Motor();
      await m.arrancar();
      motor.current = m;
      setEstado("encendido");
    } catch {
      setEstado("error");
    }
  }

  function apagar() {
    motor.current?.cerrar();
    motor.current = null;
    setEvaluacion(null);
    setEstado("apagado");
  }

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
    return (
      <p className="text-sm text-tinta-suave">Cargando el motor (7 MB)…</p>
    );
  }

  const blancas = evaluacion ? desdeLasBlancas(evaluacion.puntuacion, turnoDe(fen)) : null;
  const jugadas = evaluacion ? pvEnJugadas(fen, evaluacion.pv) : [];

  return (
    <div className="space-y-2">
      {/* La barra: blancas a la izquierda, negras a la derecha, como en cualquier
          análisis. Los colores son los de las casillas del tablero, no los del tema,
          para que sea evidente qué mitad es de quién. */}
      <div
        // El aro no es adorno: la mitad de las blancas es casi del color del fondo
        // claro y sin él no se ve dónde acaba la barra.
        className="h-2 w-full overflow-hidden rounded-full bg-[#2a3f55] ring-1 ring-borde"
        role="img"
        aria-label={
          blancas ? `Evaluación ${textoPuntuacion(blancas)}` : "Evaluación pendiente"
        }
      >
        <div
          className="h-full bg-[#e9f2fb] transition-[width] duration-200"
          style={{ width: `${blancas ? porcentajeBarra(blancas) : 50}%` }}
        />
      </div>

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
