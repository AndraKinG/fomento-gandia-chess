"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Tablero } from "./Tablero";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { Mirando } from "@/components/presencia/Mirando";
import {
  BarraEvaluacion,
  BotonAnalisis,
  PanelAnalisis,
  useAnalisis,
} from "./Analisis";

/**
 * Reproduce un PGN guardado, jugada a jugada, sobre el mismo tablero que usa el
 * editor.
 *
 * Tolerante con el PGN de entrada a propósito: viene pegado de Lichess, de
 * Chess.com o escrito a mano, y un PGN con una rareza no debe dejar la ficha de
 * la partida en blanco — si no se puede leer, se avisa y el resto de la ficha
 * (datos y anotaciones) sigue ahí.
 */
export function VisorPartida({
  pgn,
  volteado: volteadoInicial = false,
  sala,
}: {
  pgn: string;
  /** Arranca desde el punto de vista del dueño de la partida. */
  volteado?: boolean;
  /** Si se pasa, se enseña quién más está mirando esta partida. */
  sala?: string;
}) {
  const analisis = useMemo(() => {
    try {
      const c = new Chess();
      c.loadPgn(pgn);
      const historial = c.history({ verbose: true });
      if (historial.length === 0) return { error: "sin-jugadas" as const };

      // Se precalculan todas las posiciones: es una partida, no hay problema de
      // memoria, y así avanzar y retroceder es instantáneo y sin recalcular.
      const reproduccion = new Chess();
      const posiciones = [
        {
          filas: reproduccion.board(),
          san: null as string | null,
          from: null as string | null,
          to: null as string | null,
          // El FEN se guarda aquí porque es lo que come el motor, y sacarlo de la
          // posición cuando hace falta obligaría a rehacer la partida entera.
          fen: reproduccion.fen(),
        },
      ];
      for (const m of historial) {
        reproduccion.move(m.san);
        posiciones.push({
          filas: reproduccion.board(),
          san: m.san,
          from: m.from,
          to: m.to,
          fen: reproduccion.fen(),
        });
      }
      return { posiciones, historial };
    } catch {
      return { error: "ilegible" as const };
    }
  }, [pgn]);

  const [indice, setIndice] = useState(0);
  const [volteado, setVolteado] = useState(volteadoInicial);
  // El hook va aquí, ANTES del retorno del PGN ilegible: los hooks se llaman siempre
  // y en el mismo orden, y colocarlo más abajo lo saltaría en esa rama.
  const fenActual = "error" in analisis ? "" : (analisis.posiciones[indice]?.fen ?? "");
  const analizador = useAnalisis(fenActual);

  if ("error" in analisis) {
    // Justo aquí es donde más falta hace poder copiarlo: si la app no sabe leerlo,
    // el camino es llevárselo a otro sitio que sí.
    return (
      <div className="space-y-3">
        <p className="text-sm text-tinta-suave">
          {analisis.error === "sin-jugadas"
            ? "El PGN guardado no tiene jugadas que reproducir."
            : "No se ha podido leer el PGN para reproducirlo. Lo tienes en texto más abajo."}
        </p>
        <BotonCopiar texto={pgn} etiqueta="Copiar PGN" />
      </div>
    );
  }

  const { posiciones, historial } = analisis;
  const actual = posiciones[indice];
  const total = posiciones.length - 1;

  return (
    <div className="space-y-3">
      {sala && <Mirando sala={sala} />}
      {/* La barra pegada al tablero y de su misma altura (`self-stretch`), como en
          cualquier analizador: el número suelto debajo no dice de un vistazo quién
          está mejor. */}
      <div className="flex gap-2">
        {analizador.estado === "encendido" && (
          <BarraEvaluacion puntuacion={analizador.blancas} volteado={volteado} />
        )}
        <div className="min-w-0 flex-1">
          <Tablero
            filas={actual.filas}
            volteado={volteado}
            ultimoMovimiento={
              actual.from && actual.to ? { from: actual.from, to: actual.to } : null
            }
            deshabilitado
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-tinta-suave">
          {indice === 0
            ? "Posición inicial"
            : `${Math.ceil(indice / 2)}${indice % 2 === 1 ? "." : "..."} ${actual.san}`}
          <span className="ml-2 text-xs">
            ({indice}/{total})
          </span>
        </p>
        <div className="flex flex-wrap justify-end gap-1">
          <BotonAnalisis {...analizador} />
          <Paso
            etiqueta="Girar el tablero"
            simbolo="⇅"
            onClick={() => setVolteado((v) => !v)}
            deshabilitado={false}
          />
          <Paso etiqueta="Al inicio" simbolo="⏮" onClick={() => setIndice(0)} deshabilitado={indice === 0} />
          <Paso etiqueta="Anterior" simbolo="◀" onClick={() => setIndice((i) => Math.max(0, i - 1))} deshabilitado={indice === 0} />
          <Paso etiqueta="Siguiente" simbolo="▶" onClick={() => setIndice((i) => Math.min(total, i + 1))} deshabilitado={indice === total} />
          <Paso etiqueta="Al final" simbolo="⏭" onClick={() => setIndice(total)} deshabilitado={indice === total} />
        </div>
      </div>

      <div className="max-h-40 overflow-auto rounded-xl border border-borde bg-tarjeta p-3">
        <p className="font-mono text-sm leading-7 text-tinta">
          {historial.map((m, i) => (
            <span key={i}>
              {i % 2 === 0 && <span className="text-tinta-suave">{i / 2 + 1}. </span>}
              <button
                type="button"
                onClick={() => setIndice(i + 1)}
                className={`mr-1.5 rounded px-1 ${
                  indice === i + 1
                    ? "bg-acento-fuerte text-sobre-acento"
                    : "hover:bg-tarjeta-suave"
                }`}
              >
                {m.san}
              </button>
            </span>
          ))}
        </p>
      </div>

      {/* El análisis va DEBAJO de las jugadas, no encima del tablero: se enciende
          a mano y quien solo quiere ver la partida no debe encontrárselo delante. */}
      <PanelAnalisis fen={actual.fen} {...analizador} />

      {/* Copiar el PGN va junto a las jugadas y no escondido en un desplegable:
          es lo que se hace con una partida ajena —llevártela a Lichess a mirarla. */}
      <div className="flex justify-end">
        <BotonCopiar texto={pgn} etiqueta="Copiar PGN" />
      </div>
    </div>
  );
}

function Paso({
  etiqueta,
  simbolo,
  onClick,
  deshabilitado,
}: {
  etiqueta: string;
  simbolo: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className="rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-sm text-tinta transition duration-100 hover:bg-tarjeta-suave active:scale-[0.97] disabled:opacity-40"
    >
      <span aria-hidden>{simbolo}</span>
    </button>
  );
}
