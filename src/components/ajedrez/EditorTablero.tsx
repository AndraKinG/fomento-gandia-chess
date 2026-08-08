"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Tablero } from "./Tablero";
import { Boton } from "@/components/ui/Boton";
import { BotonCopiar } from "@/components/ui/BotonCopiar";

type Promocion = { from: string; to: string } | null;

const NOMBRE_PIEZA: Record<string, string> = {
  q: "Dama",
  r: "Torre",
  b: "Alfil",
  n: "Caballo",
};

/**
 * Mete una partida jugada a jugada en el tablero y genera su PGN.
 *
 * Para eso existe: una partida de tablero no tiene PGN hasta que alguien la
 * escribe, y pedirle a un socio que teclee "1. e4 e5 2. Nf3" a mano es pedirle
 * que no la suba.
 *
 * Las reglas las pone `chess.js`: legalidad, enroque, captura al paso,
 * coronación, jaque, mate, ahogado y la notación SAN sin ambigüedades (que un
 * caballo sea `Nbd2` y no `Nd2` cuando hay dos que pueden llegar).
 */
export function EditorTablero({
  onCambio,
  volteado: volteadoAuto = false,
}: {
  /** Recibe el PGN cada vez que cambia la partida. */
  onCambio: (pgn: string) => void;
  /** Orientación automática, según el color con el que jugó el socio. */
  volteado?: boolean;
}) {
  // El giro manual GANA sobre el automático, pero solo cuando existe: mientras
  // no se toque el botón, cambiar el color en el formulario sigue girando el
  // tablero solo, que es lo que se espera al corregir ese campo.
  const [giroManual, setGiroManual] = useState<boolean | null>(null);
  const volteado = giroManual ?? volteadoAuto;
  // El objeto Chess es mutable, así que el estado de React es el historial de
  // jugadas: es lo que hace que la interfaz se vuelva a pintar y lo que permite
  // reconstruir la posición sin depender de mutaciones invisibles.
  const [jugadas, setJugadas] = useState<string[]>([]);
  const [pgn, setPgn] = useState("");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [promocion, setPromocion] = useState<Promocion>(null);

  const juego = useMemo(() => {
    const c = new Chess();
    for (const j of jugadas) {
      try {
        c.move(j);
      } catch {
        // Una jugada imposible aquí solo puede venir de un estado corrupto;
        // se para en la última posición válida en vez de reventar la pantalla.
        break;
      }
    }
    return c;
  }, [jugadas]);

  const destinos = useMemo(() => {
    if (!seleccionada) return [];
    return juego
      .moves({ square: seleccionada as never, verbose: true })
      .map((m) => m.to as string);
  }, [juego, seleccionada]);

  const historial = juego.history({ verbose: true });
  const ultimo = historial.length > 0 ? historial[historial.length - 1] : null;
  const reyEnJaque = juego.isCheck()
    ? (juego
        .board()
        .flat()
        .find((c) => c && c.type === "k" && c.color === juego.turn())?.square ?? null)
    : null;

  function aplicar(nuevas: string[]) {
    setJugadas(nuevas);
    setSeleccionada(null);
    const c = new Chess();
    for (const j of nuevas) {
      try {
        c.move(j);
      } catch {
        break;
      }
    }
    const generado = nuevas.length === 0 ? "" : c.pgn();
    // Se guarda además de avisar al formulario porque el botón de copiar lo
    // necesita aquí dentro, y volver a recorrer las jugadas para reconstruirlo
    // sería hacer dos veces el mismo trabajo.
    setPgn(generado);
    onCambio(generado);
  }

  function mover(from: string, to: string, promocionA?: string) {
    const prueba = new Chess();
    for (const j of jugadas) prueba.move(j);
    try {
      const m = prueba.move({ from, to, promotion: promocionA });
      aplicar([...jugadas, m.san]);
    } catch {
      // Movimiento ilegal: se ignora y se deselecciona, sin mensajes de error.
      // El tablero ya marca los destinos válidos, así que llegar aquí es un
      // toque desviado.
      setSeleccionada(null);
    }
  }

  function onToque(casilla: string) {
    if (promocion) return;

    if (seleccionada && destinos.includes(casilla)) {
      // ¿Coronación? Se detecta antes de mover para poder preguntar la pieza.
      const posibles = juego.moves({ square: seleccionada as never, verbose: true });
      const esCoronacion = posibles.some((m) => m.to === casilla && m.promotion);
      if (esCoronacion) {
        setPromocion({ from: seleccionada, to: casilla });
        return;
      }
      mover(seleccionada, casilla);
      return;
    }

    const pieza = juego.get(casilla as never);
    // Solo se puede coger una pieza del color al que le toca mover.
    if (pieza && pieza.color === juego.turn()) {
      setSeleccionada(casilla === seleccionada ? null : casilla);
      return;
    }
    setSeleccionada(null);
  }

  const parejas: { n: number; blancas: string; negras: string }[] = [];
  for (let i = 0; i < jugadas.length; i += 2) {
    parejas.push({ n: i / 2 + 1, blancas: jugadas[i], negras: jugadas[i + 1] ?? "" });
  }

  const estado = juego.isCheckmate()
    ? `Mate. Ganan las ${juego.turn() === "w" ? "negras" : "blancas"}.`
    : juego.isStalemate()
      ? "Ahogado. Tablas."
      : juego.isDraw()
        ? "Tablas."
        : juego.isCheck()
          ? "Jaque."
          : null;

  return (
    <div className="space-y-3">
      <Tablero
        filas={juego.board()}
        volteado={volteado}
        seleccionada={seleccionada}
        destinos={destinos}
        ultimoMovimiento={ultimo ? { from: ultimo.from, to: ultimo.to } : null}
        enJaque={reyEnJaque}
        onToque={onToque}
        deshabilitado={juego.isGameOver() || promocion !== null}
      />

      {promocion && (
        <div className="rounded-xl border border-borde-acento bg-tarjeta-suave p-3">
          <p className="mb-2 text-sm font-semibold text-tinta">¿A qué corona?</p>
          <div className="flex gap-2">
            {(["q", "r", "b", "n"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const { from, to } = promocion;
                  setPromocion(null);
                  mover(from, to, p);
                }}
                className="flex-1 rounded-xl bg-acento-fuerte px-2 py-2 text-sm font-semibold text-sobre-acento transition duration-100 active:scale-[0.97]"
              >
                {NOMBRE_PIEZA[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-tinta-suave">
          {jugadas.length === 0
            ? "Mueven las blancas"
            : (estado ??
              `Mueven las ${juego.turn() === "w" ? "blancas" : "negras"}`)}
        </p>
        <div className="flex gap-2">
          <Boton
            variante="secundario"
            className="px-3 py-1.5 text-sm"
            onClick={() => setGiroManual(!volteado)}
          >
            <span aria-hidden>⇅</span> Girar
          </Boton>
          <Boton
            variante="secundario"
            className="px-3 py-1.5 text-sm"
            disabled={jugadas.length === 0}
            onClick={() => aplicar(jugadas.slice(0, -1))}
          >
            Deshacer
          </Boton>
          <Boton
            variante="secundario"
            className="px-3 py-1.5 text-sm"
            disabled={jugadas.length === 0}
            onClick={() => aplicar([])}
          >
            Vaciar
          </Boton>
        </div>
      </div>

      {parejas.length > 0 && (
        <div className="max-h-40 overflow-auto rounded-xl border border-borde bg-tarjeta p-3">
          <p className="font-mono text-sm leading-6 text-tinta">
            {parejas.map((p) => (
              <span key={p.n} className="mr-3 inline-block">
                <span className="text-tinta-suave">{p.n}.</span> {p.blancas}
                {p.negras ? ` ${p.negras}` : ""}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* El PGN que va a guardarse, a mano: mientras se mete una partida en el
          tablero es normal quererla también fuera de la app. */}
      {pgn !== "" && (
        <div className="flex justify-end">
          <BotonCopiar texto={pgn} etiqueta="Copiar PGN" />
        </div>
      )}
    </div>
  );
}
