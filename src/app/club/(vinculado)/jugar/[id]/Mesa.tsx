"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { createClient } from "@/lib/supabase/client";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { Tablero } from "@/components/ajedrez/Tablero";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { aPgn } from "@/lib/vivo/partida";
import { enReloj, paraPintar, trasJugada, type Reloj } from "@/lib/vivo/reloj";
import {
  abandonar,
  aceptarTablas,
  mover,
  ofrecerTablas,
  reclamarPorTiempo,
} from "../actions";

/**
 * La mesa: tablero, los dos relojes y el chat.
 *
 * QUÉ HACE Y QUÉ NO. Pinta y propone; no decide nada. La jugada se manda al
 * servidor y la posición que se ve sale SIEMPRE de lo que hay guardado, nunca de lo
 * que este componente crea que ha pasado. Si el servidor rechaza la jugada, el
 * tablero no se ha movido y no hay nada que deshacer.
 *
 * EL RELOJ DE AQUÍ ES DECORADO: cuenta hacia atrás para que se vea correr, pero
 * arranca siempre de los números que manda el servidor y se corrige con cada
 * jugada. El que manda es el de la base.
 *
 * POR QUÉ LA JUGADA SE PINTA ANTES DE MANDARLA. La primera versión esperaba a que
 * el servidor contestara para mover la pieza, y con una acción de servidor por
 * jugada eso son cientos de milisegundos en los que el tablero está congelado. En
 * una partida a 3+2 eso no es jugable. Ahora la jugada se valida aquí con las mismas
 * reglas, se pinta al momento y se manda en paralelo; si el servidor la rechaza —no
 * era tu turno, se te acabó el tiempo—, se vuelve atrás y se dice por qué. El
 * servidor sigue siendo el que manda: esto solo adelanta el dibujo.
 *
 * Y EL TIEMPO REAL LLEVA RED DE SEGURIDAD. `postgres_changes` puede perderse un
 * aviso —reconexión, pestaña dormida, RLS que tarda en aplicarse—, y perderse un
 * aviso aquí significa quedarte mirando un tablero que ya no es el de la partida. Se
 * recarga la fila cada dos segundos mientras la partida está viva.
 */

export type Partida = {
  id: string;
  blancasId: string;
  negrasId: string;
  blancasNombre: string;
  negrasNombre: string;
  /** ELO oficial de cada uno, para el resumen del final. null si no lo tienen. */
  blancasElo: number | null;
  negrasElo: number | null;
  jugadas: string[];
  turno: "w" | "b";
  blancasMs: number;
  negrasMs: number;
  baseMs: number;
  incrementoMs: number;
  ultimaJugadaEn: string | null;
  resultado: string | null;
  motivo: string | null;
  tablasOfrecidasPor: string | null;
};

export type Mensaje = { id: string; playerId: string; texto: string; creadoEn: string };

const MOTIVOS: Record<string, string> = {
  mate: "por mate",
  tiempo: "por tiempo",
  abandono: "por abandono",
  ahogado: "por ahogado",
  "tablas-acordadas": "de común acuerdo",
  "material-insuficiente": "por material insuficiente",
  "triple-repeticion": "por triple repetición",
  "regla-50": "por la regla de las 50 jugadas",
};

export function Mesa({
  inicial,
  mensajesIniciales,
  yo,
}: {
  inicial: Partida;
  mensajesIniciales: Mensaje[];
  /** Ficha de quien mira. null = está de espectador. */
  yo: string | null;
}) {
  const [p, setP] = useState(inicial);
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());
  /** Estado de la conexión en vivo, para poder enseñarlo. Un canal que se suscribe
   *  pero no recibe nada es indistinguible de uno sano y sin novedades. */
  const [enVivo, setEnVivo] = useState<"conectando" | "si" | "no">("conectando");
  /** El resumen del final se puede cerrar: al acabar una partida mucha gente quiere
   *  quedarse mirando la posición, y un cartel encima del tablero estorba. */
  const [resumenCerrado, setResumenCerrado] = useState(false);
  /**
   * Cuántas jugadas damos ya por hechas.
   *
   * ES LA GUARDA CONTRA EL REBOTE. Al mover se pinta la jugada al momento, pero el
   * reintento sigue preguntando por la fila: si contesta ANTES de que el servidor
   * haya guardado —y con 600 ms de reintento pasa casi siempre—, devuelve la
   * posición de antes y la pieza se vuelve sola a su casilla, para volver a moverse
   * medio segundo después. Cualquier estado con menos jugadas de las que ya tenemos
   * es viejo y se tira.
   */
  const jugadasFirmes = useRef(inicial.jugadas.length);
  const cajaChat = useRef<HTMLDivElement | null>(null);

  const miColor: "w" | "b" | null =
    yo === p.blancasId ? "w" : yo === p.negrasId ? "b" : null;
  const enJuego = p.resultado === null;
  const meToca = enJuego && miColor !== null && p.turno === miColor;

  // TIEMPO REAL: la fila entera llega en cada cambio (`replica identity full` en la
  // migración 0022), así que la jugada del rival aparece sola, sin recargar.
  useEffect(() => {
    // El canal se monta DENTRO de una promesa porque hay que poner el token del
    // usuario en el socket antes de suscribir: sin él, la RLS filtra todos los
    // avisos y no llega ninguno. Ver `clienteEnVivo`.
    let cerrar: (() => void) | null = null;
    let cancelado = false;

    void clienteEnVivo().then(({ supabase, conSesion }) => {
      if (cancelado) return;
      if (!conSesion) {
        // Sin sesión el socket va como anónimo y la RLS filtra TODOS los avisos.
        setEnVivo("no");
        return;
      }
      const canal = supabase
      .channel(`partida-${p.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_games", filter: `id=eq.${p.id}` },
        (aviso) => {
          const f = aviso.new as Record<string, unknown>;
          const cuantas = ((f.jugadas as string[]) ?? []).length;
          // Un aviso con menos jugadas de las que ya damos por hechas es viejo; la
          // única excepción es el final de la partida, que hay que atender siempre.
          if (cuantas < jugadasFirmes.current && !f.resultado) return;
          jugadasFirmes.current = cuantas;
          setP((antes) => ({
            ...antes,
            jugadas: (f.jugadas as string[]) ?? [],
            turno: f.turno as "w" | "b",
            blancasMs: f.blancas_ms as number,
            negrasMs: f.negras_ms as number,
            ultimaJugadaEn: (f.ultima_jugada_en as string | null) ?? null,
            resultado: (f.resultado as string | null) ?? null,
            motivo: (f.motivo as string | null) ?? null,
            tablasOfrecidasPor: (f.tablas_ofrecidas_por as string | null) ?? null,
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat", filter: `live_game_id=eq.${p.id}` },
        (aviso) => {
          const f = aviso.new as Record<string, unknown>;
          setMensajes((antes) =>
            antes.some((m) => m.id === f.id)
              ? antes
              : [
                  ...antes,
                  {
                    id: f.id as string,
                    playerId: f.player_id as string,
                    texto: f.texto as string,
                    creadoEn: f.creado_en as string,
                  },
                ]
          );
        }
      )
      .subscribe((estado) => {
        if (cancelado) return;
        setEnVivo(estado === "SUBSCRIBED" ? "si" : estado === "CLOSED" ? "conectando" : "no");
      });
      cerrar = () => void supabase.removeChannel(canal);
    });

    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [p.id]);

  // RED DE SEGURIDAD del tiempo real: se recarga la fila cada dos segundos mientras
  // la partida está viva. Si el aviso llegó, esto no cambia nada; si se perdió,
  // evita quedarte mirando un tablero que ya no es el de la partida —que es lo que
  // obligaba a recargar a mano.
  useEffect(() => {
    if (p.resultado !== null) return;
    const supabase = createClient();
    // MÁS RÁPIDO CUANDO ESPERAS AL RIVAL, que es cuando la tardanza se nota: son los
    // segundos en los que estás mirando el tablero sin poder hacer nada. Cuando te
    // toca a ti no hay prisa, porque la novedad la vas a producir tú.
    const cada = meToca ? 2000 : 400;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("live_games")
        .select(
          "jugadas, turno, blancas_ms, negras_ms, ultima_jugada_en, resultado, motivo, tablas_ofrecidas_por"
        )
        .eq("id", p.id)
        .maybeSingle();
      if (!data) return;
      const cuantas = (data.jugadas ?? []).length;
      if (cuantas < jugadasFirmes.current && !data.resultado) return;
      jugadasFirmes.current = cuantas;
      setP((antes) => {
        // Si no ha cambiado nada, se devuelve el mismo objeto: cambiarlo repintaría
        // el tablero entero dos veces por segundo para nada.
        if (
          antes.jugadas.length === (data.jugadas ?? []).length &&
          antes.resultado === data.resultado &&
          antes.tablasOfrecidasPor === data.tablas_ofrecidas_por
        ) {
          return antes;
        }
        return {
          ...antes,
          jugadas: data.jugadas ?? [],
          turno: data.turno,
          blancasMs: data.blancas_ms,
          negrasMs: data.negras_ms,
          ultimaJugadaEn: data.ultima_jugada_en,
          resultado: data.resultado,
          motivo: data.motivo,
          tablasOfrecidasPor: data.tablas_ofrecidas_por,
        };
      });
      // El chat va en la misma pasada: tenía el mismo problema y ninguna red.
      const { data: dichos } = await supabase
        .from("live_chat")
        .select("id, player_id, texto, creado_en")
        .eq("live_game_id", p.id)
        .order("creado_en");
      if (dichos) {
        setMensajes((antes) =>
          antes.length === dichos.length
            ? antes
            : dichos.map((m) => ({
                id: m.id,
                playerId: m.player_id,
                texto: m.texto,
                creadoEn: m.creado_en,
              }))
        );
      }
    }, cada);
    return () => clearInterval(t);
  }, [p.id, p.resultado, meToca]);

  // La cuenta atrás. Cada décima porque en los últimos segundos se ven décimas; en
  // cuanto la partida acaba se para, que si no sigue restando sobre un resultado.
  useEffect(() => {
    if (!enJuego) return;
    const t = setInterval(() => setAhora(Date.now()), 100);
    return () => clearInterval(t);
  }, [enJuego]);

  // EL CHAT SE DESPLAZA SOLO, PERO SOLO ÉL. Antes usaba `scrollIntoView`, y eso
  // desplaza TODOS los contenedores con scroll de los que cuelga —incluida la
  // ventana—, así que al mandar un mensaje desde una tablet la página entera se iba
  // arriba del todo y había que volver a bajar. Moviendo el `scrollTop` de la caja,
  // el resto de la página se queda donde estaba.
  useEffect(() => {
    const caja = cajaChat.current;
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [mensajes]);

  const reloj: Reloj = {
    blancasMs: p.blancasMs,
    negrasMs: p.negrasMs,
    turno: p.turno,
    ultimaJugadaEn: p.ultimaJugadaEn ? Date.parse(p.ultimaJugadaEn) : null,
  };
  const tiempos = enJuego
    ? paraPintar(reloj, ahora)
    : { blancasMs: p.blancasMs, negrasMs: p.negrasMs };

  // La posición sale de las jugadas, que es la única fuente de verdad. Memoizada
  // porque se reconstruye entera y el componente se repinta diez veces por segundo
  // con la cuenta atrás.
  const juego = useMemo(() => {
    const c = new Chess();
    for (const j of p.jugadas) {
      try {
        c.move(j);
      } catch {
        break;
      }
    }
    return c;
  }, [p.jugadas]);
  const ultima = juego.history({ verbose: true }).at(-1);

  const [elegida, setElegida] = useState<string | null>(null);
  const destinos = elegida
    ? juego.moves({ square: elegida as never, verbose: true }).map((m) => m.to as string)
    : [];

  async function enviar(desde: string, hasta: string) {
    setElegida(null);
    setError(null);
    // Coronación: si la jugada admite corona, se pide dama. Elegir pieza es un caso
    // raro en partida rápida y un diálogo aquí cuesta segundos de reloj.
    const posibles = juego.moves({ square: desde as never, verbose: true });
    const corona = posibles.some((m) => m.to === hasta && m.promotion) ? "q" : undefined;

    // Se comprueba aquí con las mismas reglas antes de pintarla: si es ilegal, ni
    // se manda. Legal o no lo dice `chess.js`, igual que en el servidor.
    const prueba = new Chess(juego.fen());
    let san: string;
    try {
      san = prueba.move({ from: desde, to: hasta, promotion: corona }).san;
    } catch {
      return;
    }

    // Se guarda la posición de antes para poder volver si el servidor dice que no.
    const antes = p;
    const ahoraMs = Date.now();

    // EL RELOJ TAMBIÉN SE ADELANTA, con la misma cuenta que hará el servidor. Sin
    // esto, la jugada se pintaba pero los relojes seguían como estaban: el del
    // rival empezaba a descontar desde la marca vieja y el número pegaba un salto
    // hacia atrás en cuanto llegaba la fila de verdad.
    const relojTrasMover = trasJugada(
      {
        blancasMs: antes.blancasMs,
        negrasMs: antes.negrasMs,
        turno: antes.turno,
        ultimaJugadaEn: antes.ultimaJugadaEn ? Date.parse(antes.ultimaJugadaEn) : null,
      },
      { baseMs: antes.baseMs, incrementoMs: antes.incrementoMs },
      ahoraMs
    );

    jugadasFirmes.current = antes.jugadas.length + 1;
    setP((estado) => ({
      ...estado,
      jugadas: [...estado.jugadas, san],
      turno: relojTrasMover.turno,
      blancasMs: relojTrasMover.blancasMs,
      negrasMs: relojTrasMover.negrasMs,
      ultimaJugadaEn: new Date(ahoraMs).toISOString(),
      // Mover mata cualquier oferta de tablas viva, igual que en el servidor.
      tablasOfrecidasPor: null,
    }));

    const r = await mover(p.id, { desde, hasta, corona });
    if (r.error) {
      // El servidor manda: se deshace lo pintado y se dice por qué.
      jugadasFirmes.current = antes.jugadas.length;
      setP(antes);
      setError(r.error);
    }
  }

  function tocar(casilla: string) {
    if (!meToca) return;
    if (elegida && destinos.includes(casilla)) {
      void enviar(elegida, casilla);
      return;
    }
    const pieza = juego.get(casilla as never);
    setElegida(pieza && pieza.color === miColor ? casilla : null);
  }

  async function mandarMensaje() {
    const limpio = texto.trim();
    if (!limpio || !yo) return;
    setTexto("");
    const supabase = createClient();
    // El chat sí lo escribe el cliente: su política solo deja escribir como uno
    // mismo y en las partidas propias (migración 0022).
    const { error: e } = await supabase
      .from("live_chat")
      .insert({ live_game_id: p.id, player_id: yo, texto: limpio });
    if (e) setError("No se ha podido mandar el mensaje.");
  }

  const arriba = miColor === "b" ? "blancas" : "negras";
  const nombreArriba = arriba === "blancas" ? p.blancasNombre : p.negrasNombre;
  const nombreAbajo = arriba === "blancas" ? p.negrasNombre : p.blancasNombre;
  const msArriba = arriba === "blancas" ? tiempos.blancasMs : tiempos.negrasMs;
  const msAbajo = arriba === "blancas" ? tiempos.negrasMs : tiempos.blancasMs;
  const turnoArriba = arriba === "blancas" ? p.turno === "w" : p.turno === "b";

  const meOfrecenTablas =
    enJuego && p.tablasOfrecidasPor !== null && p.tablasOfrecidasPor !== yo && miColor !== null;

  return (
    <>
      {p.resultado && !resumenCerrado && (
        <Resumen partida={p} onCerrar={() => setResumenCerrado(true)} />
      )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,32rem)_1fr]">
      <div className="space-y-2">
        {enJuego && enVivo !== "si" && (
          <p className="px-1 text-xs text-tinta-suave">
            {enVivo === "conectando"
              ? "Conectando en vivo…"
              : "Sin conexión en vivo: las jugadas del rival tardan un segundo en aparecer."}
          </p>
        )}
        <Jugador nombre={nombreArriba} ms={msArriba} corriendo={enJuego && turnoArriba} />
        <Tablero
          filas={juego.board()}
          volteado={miColor === "b"}
          seleccionada={elegida}
          destinos={destinos}
          ultimoMovimiento={ultima ? { from: ultima.from, to: ultima.to } : null}
          enJaque={
            juego.isCheck()
              ? (juego
                  .board()
                  .flat()
                  .find((c) => c && c.type === "k" && c.color === juego.turn())?.square ?? null)
              : null
          }
          onToque={tocar}
          onSoltar={(desde, hasta) => void enviar(desde, hasta)}
          onCancelar={() => setElegida(null)}
          deshabilitado={!meToca}
        />
        <Jugador nombre={nombreAbajo} ms={msAbajo} corriendo={enJuego && !turnoArriba} />
      </div>

      <div className="space-y-3">

        {meOfrecenTablas && (
          <Banner tipo="aviso">
            Te ofrecen tablas.{" "}
            <button
              type="button"
              onClick={() => void aceptarTablas(p.id)}
              className="font-semibold underline"
            >
              Aceptar
            </button>
          </Banner>
        )}
        {error && <Banner tipo="error">{error}</Banner>}

        {enJuego && miColor !== null && (
          <div className="flex flex-wrap gap-2">
            {/* DOBLE TOQUE en lo que no tiene vuelta atrás. Abandonar es un dedo
                mal puesto y la partida perdida, y en un móvil con el reloj corriendo
                pasa. Retirar la oferta de tablas no hace falta confirmarlo: eso sí
                se deshace. */}
            <Confirmar
              etiqueta={p.tablasOfrecidasPor === yo ? "Retirar tablas" : "Ofrecer tablas"}
              seguro={p.tablasOfrecidasPor === yo ? "Retirar tablas" : "¿Seguro? Ofrecer"}
              directo={p.tablasOfrecidasPor === yo}
              onConfirmar={() => void ofrecerTablas(p.id)}
            />
            <Confirmar
              etiqueta="Abandonar"
              seguro="¿Seguro? Abandonar"
              onConfirmar={() => void abandonar(p.id)}
            />
            {/* Solo cuando de verdad se le ha acabado al rival: el servidor lo
                vuelve a comprobar, pero enseñar el botón antes de tiempo confunde. */}
            {!meToca && msArriba <= 0 && (
              <Boton
                variante="solido"
                className="px-3 py-1.5 text-sm"
                onClick={() => void reclamarPorTiempo(p.id)}
              >
                Reclamar por tiempo
              </Boton>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-borde bg-tarjeta">
          {/* Copiar el PGN también aquí, y no solo en el resumen del final: el
              resumen se cierra y no vuelve, y a mitad de partida también se quiere
              llevar la posición a otro sitio para mirarla. */}
          <div className="flex items-center gap-2 border-b border-borde px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
              Jugadas
            </p>
            {p.jugadas.length > 0 && (
              <BotonCopiar
                texto={pgnDe(p)}
                etiqueta="Copiar PGN"
                className="ml-auto px-2 py-0.5 text-xs"
              />
            )}
          </div>
          <p className="max-h-32 overflow-auto p-3 font-mono text-sm leading-6 text-tinta">
            {p.jugadas.length === 0 && (
              <span className="text-tinta-suave">Todavía no se ha jugado nada.</span>
            )}
            {p.jugadas.map((j, i) => (
              <span key={i} className="mr-2">
                {i % 2 === 0 && <span className="text-tinta-suave">{i / 2 + 1}. </span>}
                {j}
              </span>
            ))}
          </p>
        </div>

        <div className="flex h-64 flex-col rounded-2xl border border-borde bg-tarjeta">
          <p className="border-b border-borde px-3 py-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            Chat
          </p>
          <div ref={cajaChat} className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {mensajes.length === 0 && (
              <p className="text-sm text-tinta-suave">Aún no habéis dicho nada.</p>
            )}
            {mensajes.map((m) => (
              <p key={m.id} className="text-sm">
                <span className="font-semibold text-tinta-suave">
                  {m.playerId === p.blancasId ? p.blancasNombre : p.negrasNombre}:{" "}
                </span>
                <span className="text-tinta">{m.texto}</span>
              </p>
            ))}
          </div>
          {miColor !== null && (
            <div className="flex gap-2 border-t border-borde p-2">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void mandarMensaje();
                  }
                }}
                maxLength={300}
                placeholder="Escribe…"
                className="min-w-0 flex-1 rounded-xl border border-borde bg-fondo px-3 py-1.5 text-sm text-tinta placeholder:text-tinta-suave"
              />
              <Boton
                variante="secundario"
                className="px-3 py-1.5 text-sm"
                onClick={() => void mandarMensaje()}
              >
                Enviar
              </Boton>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/** PGN de una partida en vivo, para copiarla. Se arma aquí porque lo piden dos
 *  sitios: la caja de jugadas y el resumen del final. */
function pgnDe(partida: Partida): string {
  return aPgn(
    {
      jugadas: partida.jugadas,
      cadencia: { baseMs: partida.baseMs, incrementoMs: partida.incrementoMs },
      reloj: {
        blancasMs: partida.blancasMs,
        negrasMs: partida.negrasMs,
        turno: partida.turno,
        ultimaJugadaEn: null,
      },
      resultado: partida.resultado as "1-0" | "0-1" | "1/2-1/2" | null,
      motivo: null,
    },
    {
      blancas: partida.blancasNombre,
      negras: partida.negrasNombre,
      fecha: new Date().toISOString().slice(0, 10),
    }
  );
}

/** Lo que puntúa cada uno, para ponerlo al lado de su nombre. */
function puntosDe(resultado: string | null): { blancas: string; negras: string } {
  if (resultado === "1-0") return { blancas: "1", negras: "0" };
  if (resultado === "0-1") return { blancas: "0", negras: "1" };
  return { blancas: "½", negras: "½" };
}

/**
 * Resumen de la partida, al acabar.
 *
 * VENTANA POR ENCIMA DE TODO, y no una tarjeta más en la columna: sale UNA vez, al
 * acabar, y es el momento en que se quiere leer eso y nada más. Como tarjeta
 * quedaba mezclada con los mandos y el chat, que ya no sirven para nada.
 *
 * SE CIERRA DE TRES MANERAS —la equis, el fondo y Escape—, porque después de leerlo
 * lo normal es querer quedarse mirando la posición final, y una ventana de la que
 * cuesta salir es peor que no tenerla.
 */
function Resumen({ partida, onCerrar }: { partida: Partida; onCerrar: () => void }) {
  const gana =
    partida.resultado === "1-0"
      ? partida.blancasNombre
      : partida.resultado === "0-1"
        ? partida.negrasNombre
        : null;
  const puntos = puntosDe(partida.resultado);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resumen de la partida"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onCerrar}
    >
      <div
        // El clic dentro no cierra: si no, tocar el botón de copiar cerraría la
        // ventana antes de copiar nada.
        onClick={(e) => e.stopPropagation()}
        className="aparece w-full max-w-sm rounded-2xl border border-borde-acento bg-tarjeta p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-bold text-tinta">
              {gana ? `Gana ${gana}` : "Tablas"}
            </p>
            <p className="text-sm text-tinta-suave">
              {partida.motivo ? (MOTIVOS[partida.motivo] ?? "").replace(/^por /, "Por ") : ""}
              {partida.motivo ? " · " : ""}
              {Math.round(partida.baseMs / 60_000)}+
              {Math.round(partida.incrementoMs / 1000)} · {partida.jugadas.length} jugadas
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el resumen"
            className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-tinta-suave transition hover:bg-tarjeta-suave"
          >
            ✕
          </button>
        </div>

        {/* EL RESULTADO, AL LADO DE CADA NOMBRE: así se lee de un vistazo quién hizo
            qué, en vez de tener que traducir un "1-0" a personas. */}
        <ul className="mt-4 space-y-1.5">
          {(
            [
              { icono: "♙", nombre: partida.blancasNombre, elo: partida.blancasElo, punto: puntos.blancas },
              { icono: "♟", nombre: partida.negrasNombre, elo: partida.negrasElo, punto: puntos.negras },
            ] as const
          ).map((j) => (
            <li
              key={j.icono}
              className="flex items-center gap-2 rounded-xl bg-tarjeta-suave px-3 py-2"
            >
              <span aria-hidden className="shrink-0 text-tinta-suave">
                {j.icono}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-tinta">{j.nombre}</span>
              <span className="shrink-0 text-xs tabular-nums text-tinta-suave">
                {j.elo ?? "—"}
              </span>
              <span className="w-6 shrink-0 text-right font-mono text-base font-bold text-tinta">
                {j.punto}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center gap-2">
          <BotonCopiar texto={pgnDe(partida)} etiqueta="Copiar PGN" />
          <Boton variante="secundario" className="ml-auto px-3 py-1.5 text-sm" onClick={onCerrar}>
            Ver el tablero
          </Boton>
        </div>
      </div>
    </div>
  );
}

/**
 * Botón que pide un segundo toque antes de hacer nada.
 *
 * El aviso se cae solo a los cuatro segundos: si te has arrepentido, dejarlo puesto
 * es una trampa esperando al siguiente dedo.
 */
function Confirmar({
  etiqueta,
  seguro,
  directo = false,
  onConfirmar,
}: {
  etiqueta: string;
  seguro: string;
  /** true para hacerlo al primer toque, sin preguntar. */
  directo?: boolean;
  onConfirmar: () => void;
}) {
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);

  return (
    <Boton
      variante={armado ? "solido" : "secundario"}
      className="px-3 py-1.5 text-sm"
      onClick={() => {
        if (directo || armado) {
          setArmado(false);
          onConfirmar();
          return;
        }
        setArmado(true);
      }}
    >
      {armado ? seguro : etiqueta}
    </Boton>
  );
}

/** Nombre y reloj de un jugador. El reloj se resalta cuando le corre a él. */
function Jugador({
  nombre,
  ms,
  corriendo,
}: {
  nombre: string;
  ms: number;
  corriendo: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-borde bg-tarjeta px-3 py-2">
      <span className="min-w-0 truncate text-sm text-tinta">{nombre}</span>
      <span
        className={`shrink-0 rounded-lg px-2.5 py-1 font-mono text-lg tabular-nums ${
          ms <= 0
            ? "bg-red-600 text-white"
            : corriendo
              ? "bg-acento-fuerte text-sobre-acento"
              : "bg-tarjeta-suave text-tinta"
        }`}
      >
        {enReloj(ms)}
      </span>
    </div>
  );
}
