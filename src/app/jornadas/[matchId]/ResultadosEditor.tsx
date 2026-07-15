"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { ChipTablero } from "@/components/ui/ChipTablero";
import { calcularMarcador } from "@/lib/marcador";
import { guardarResultado } from "./actions";

type Color = "blancas" | "negras";
type Resultado = 1 | 0.5 | 0;

export type BoardParaEditar = {
  lineupBoardId: string;
  tablero: number;
  color: Color;
  nombre: string;
  resultadoInicial: Resultado | null;
};

const OPCIONES: { valor: Resultado; etiqueta: string }[] = [
  { valor: 1, etiqueta: "Gana" },
  { valor: 0.5, etiqueta: "Tablas" },
  { valor: 0, etiqueta: "Pierde" },
];

/**
 * Editor de resultados del capitán/admin (Task 7): un tap por tablero guarda
 * de inmediato (useTransition, sin botón "guardar" aparte — igual de
 * inmediato que `BotonesDisponibilidad`). Las 3 opciones son SIEMPRE desde
 * el punto de vista de NUESTRO jugador en ese tablero (nunca "blancas
 * ganan"): "Gana/Tablas/Pierde" es más claro para el capitán que rellena
 * esto en directo que "1-0/½-½/0-1", que obligaría a traducir mentalmente
 * según el color de la ficha en el tablero.
 */
export function ResultadosEditor({
  matchId,
  boards,
  totalTableros,
}: {
  matchId: string;
  boards: BoardParaEditar[];
  totalTableros: number;
}) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Record<string, Resultado | null>>(() =>
    Object.fromEntries(boards.map((b) => [b.lineupBoardId, b.resultadoInicial]))
  );
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, iniciarGuardado] = useTransition();

  const marcador = calcularMarcador(
    Object.values(resultados).filter((r): r is Resultado => r !== null),
    totalTableros
  );

  function onElegir(lineupBoardId: string, valor: Resultado) {
    setError(null);
    setGuardandoId(lineupBoardId);
    iniciarGuardado(async () => {
      const resultado = await guardarResultado(matchId, lineupBoardId, valor);
      setGuardandoId(null);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setResultados((prev) => ({ ...prev, [lineupBoardId]: valor }));
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-tinta">Resultados</h2>
        <span className="shrink-0 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-sm font-semibold text-acento-texto ring-1 ring-borde-acento">
          {marcador.texto} · {marcador.completos}/{marcador.total}
        </span>
      </div>
      {error && <Banner tipo="error">{error}</Banner>}
      {boards.map((b) => {
        const actual = resultados[b.lineupBoardId];
        const guardando = guardandoId === b.lineupBoardId;
        return (
          <Tarjeta key={b.lineupBoardId} compacta className="space-y-2">
            <div className="flex items-center gap-2">
              <ChipTablero tablero={b.tablero} color={b.color} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-tinta">{b.nombre}</span>
            </div>
            <div className="flex gap-2">
              {OPCIONES.map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  disabled={guardando}
                  onClick={() => onElegir(b.lineupBoardId, op.valor)}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition disabled:opacity-50 ${
                    actual === op.valor
                      ? "bg-acento-fuerte text-sobre-acento"
                      : "border border-borde bg-tarjeta text-tinta hover:bg-tarjeta-suave"
                  }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>
          </Tarjeta>
        );
      })}
    </section>
  );
}
