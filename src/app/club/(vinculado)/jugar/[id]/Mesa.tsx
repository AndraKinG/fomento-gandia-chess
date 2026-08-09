"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { createClient } from "@/lib/supabase/client";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import { Tablero } from "@/components/ajedrez/Tablero";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { PuntoConectado } from "@/components/presencia/Presencia";
import { aPgn } from "@/lib/vivo/partida";
import { enReloj, paraPintar, trasJugada, type Reloj } from "@/lib/vivo/reloj";
import {
  abandonar,
  aceptarTablas,
  mover,
  ofrecerTablas,
  pedirVolverJugada,
  reclamarPorTiempo,
  responderVolverJugada,
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
 * Y NO SE MEZCLAN DOS RELOJES, que es de donde salía el temblor al mover. La fila
 * trae `ultima_jugada_en` con la hora DEL SERVIDOR; restarle la hora del navegador
 * mide, además del tiempo pensado, la diferencia entre los dos relojes — y esa
 * diferencia son segundos enteros en cuanto un aparato va desajustado. El número
 * subía y bajaba solo. Aquí se ignora esa marca para pintar: cuando llega una fila
 * se apunta el instante LOCAL en que llegó, y la cuenta atrás mide contra él. Así
 * solo se resta tiempo medido con el mismo reloj.
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
  vueltaPedidaPor: string | null;
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
  const [ahora, setAhora] = useState(() => performance.now());
  /** Estado de la conexión en vivo, para poder enseñarlo. Un canal que se suscribe
   *  pero no recibe nada es indistinguible de uno sano y sin novedades. */
  const [enVivo, setEnVivo] = useState<"conectando" | "si" | "no">("conectando");
  /** El resumen del final se puede cerrar: al acabar una partida mucha gente quiere
   *  quedarse mirando la posición, y un cartel encima del tablero estorba. */
  const [resumenCerrado, setResumenCerrado] = useState(false);
  /**
   * La ventana del resumen sale UNA VEZ POR PARTIDA, y se recuerda en el navegador.
   *
   * Antes volvía a saltar en cada recarga de una partida ya terminada, y eso es un
   * cartel modal delante de algo que ya has leído. El resumen no se pierde: se queda
   * en la columna de la derecha para siempre.
   */
  const [yaVisto] = useState(() => {
    // Se lee al crear el estado y no en un efecto: en un efecto, la ventana llegaría
    // a pintarse un instante antes de esconderse, que es justo el parpadeo que se
    // quiere evitar. En el servidor no hay `localStorage`, y ahí devuelve false.
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(`resumen-visto-${inicial.id}`) === "1";
    } catch {
      // Sin almacenamiento (modo privado, permisos): se comporta como antes.
      return false;
    }
  });
  const marcarVisto = useCallback(() => {
    try {
      localStorage.setItem(`resumen-visto-${inicial.id}`, "1");
    } catch {
      // Da igual: lo peor que pasa es que vuelva a salir.
    }
  }, [inicial.id]);
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
  /**
   * Momento LOCAL en que llegó el estado que se está pintando.
   *
   * Es la referencia de la cuenta atrás. No se usa `ultima_jugada_en` porque esa
   * marca es del reloj del servidor y aquí se resta con el del navegador: la
   * diferencia entre ambos se colaba entera en el tiempo que se enseña.
   *
   * VA EN ESTADO Y NO EN UNA REFERENCIA porque hace falta PARA PINTAR: el reloj se
   * dibuja a partir de él, y una referencia leída al pintar no repinta nada.
   */
  const [recibidoEn, setRecibidoEn] = useState(() => performance.now());
  /** Jugadas que había en el último estado aplicado, para saber si una novedad
   *  llegó por difusión o la pilló el reintento. */
  const antesJugadas = useRef(inicial.jugadas.length);
  /**
   * Marca del último estado aplicado.
   *
   * SIRVE PARA NO REINICIAR EL RELOJ SIN MOTIVO, y ese era el "baja y luego se los
   * suma": tras cada jugada se relee la fila tres veces, y si la segunda y la
   * tercera traen lo mismo, volver a aplicarlas ponía la referencia a cero otra vez
   * — o sea, devolver al reloj los segundos que ya se habían contado. Una fila que
   * no ha cambiado no se toca.
   */
  const ultimaMarca = useRef<string | null>(inicial.ultimaJugadaEn);
  /** El canal, para poder difundir desde aquí lo que escribe el cliente: el chat lo
   *  inserta el navegador, así que el aviso también sale de aquí. */
  const canalRef = useRef<ReturnType<
    Awaited<ReturnType<typeof clienteEnVivo>>["supabase"]["channel"]
  > | null>(null);
  const cajaChat = useRef<HTMLDivElement | null>(null);

  const miColor: "w" | "b" | null =
    yo === p.blancasId ? "w" : yo === p.negrasId ? "b" : null;
  const enJuego = p.resultado === null;
  const meToca = enJuego && miColor !== null && p.turno === miColor;

  // TIEMPO REAL: la fila entera llega en cada cambio (`replica identity full` en la
  // migración 0022), así que la jugada del rival aparece sola, sin recargar.
  /**
   * Aplica una fila que llega de fuera, venga de la difusión o del reintento.
   *
   * La guarda de jugadas viejas está AQUÍ y no en cada sitio: dos copias de la misma
   * regla acaban separándose, y esta es la que impide que la pieza rebote.
   */
  const aplicarFila = useCallback((f: Record<string, unknown>) => {
    const cuantas = ((f.jugadas as string[]) ?? []).length;
    if (cuantas < jugadasFirmes.current && !f.resultado) return;

    // Nada nuevo: ni se toca. Volver a aplicar la misma fila reiniciaría la cuenta
    // atrás y le devolvería al reloj el tiempo ya corrido.
    const marca = (f.ultima_jugada_en as string | null) ?? null;
    const igual =
      marca === ultimaMarca.current &&
      cuantas === antesJugadas.current &&
      ((f.resultado as string | null) ?? null) === null;
    if (igual) return;

    /**
     * LA REFERENCIA SOLO SE REINICIA SI LA JUGADA ES NUEVA PARA NOSOTROS.
     *
     * Aquí estaba el segundo que se devolvía. Los milisegundos que manda el servidor
     * son los del INSTANTE DE LA JUGADA, no los de ahora; entre una cosa y otra está
     * el viaje de ida y vuelta. Si al llegar la confirmación se pone la referencia a
     * "ahora", ese viaje se descuenta dos veces... o mejor dicho, se le regala al
     * reloj: medido, el rival tardaba 1,9 s en bajar de 4:59 a 4:58.
     *
     * Cuando la jugada ya la habíamos pintado nosotros, la referencia buena es la que
     * ya teníamos —marca justo ese instante—, así que se deja como está.
     */
    const esNueva = cuantas > antesJugadas.current;
    ultimaMarca.current = marca;
    antesJugadas.current = cuantas;
    jugadasFirmes.current = cuantas;
    if (esNueva) setRecibidoEn(performance.now());
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
      vueltaPedidaPor: (f.vuelta_pedida_por as string | null) ?? null,
    }));
  }, []);

  /**
   * Aplica una jugada que llega por difusión, si es legal en la posición que se está
   * viendo. Solo adelanta el dibujo: la fila de la base manda igual.
   */
  const aplicarJugadaSuelta = useCallback(
    (san: string) => {
      setP((antes) => {
        const c = new Chess();
        try {
          for (const j of antes.jugadas) c.move(j);
          c.move(san);
        } catch {
          // No encaja con lo que tenemos: se ignora y ya llegará la fila buena.
          return antes;
        }

        // EL RELOJ DEL RIVAL TAMBIÉN SE ADELANTA, con la misma cuenta que hará el
        // servidor. Sin esto se pintaba su jugada pero su reloj se quedaba clavado
        // en el número de antes, y al llegar la fila de verdad pegaba el salto de
        // golpe: bajaba lo pensado y subía el incremento. Como aquí ya sabemos
        // cuánto lleva corriendo —desde que llegó el último estado—, se aplica y no
        // hay salto que dar.
        const pensado = antes.ultimaJugadaEn === null ? 0 : performance.now() - recibidoEn;
        const tras = trasJugada(
          {
            blancasMs: antes.blancasMs,
            negrasMs: antes.negrasMs,
            turno: antes.turno,
            ultimaJugadaEn: antes.ultimaJugadaEn === null ? null : 0,
          },
          { baseMs: antes.baseMs, incrementoMs: antes.incrementoMs },
          pensado
        );

        jugadasFirmes.current = antes.jugadas.length + 1;
        antesJugadas.current = antes.jugadas.length + 1;
        return {
          ...antes,
          jugadas: [...antes.jugadas, san],
          turno: tras.turno,
          blancasMs: tras.blancasMs,
          negrasMs: tras.negrasMs,
          ultimaJugadaEn: new Date().toISOString(),
          tablasOfrecidasPor: null,
          vueltaPedidaPor: null,
        };
      });
      setRecibidoEn(performance.now());
    },
    [recibidoEn]
  );

  /** Va a por la fila y la aplica. La usan el empujón del rival y el reintento. */
  const releer = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("live_games")
      .select(
        "jugadas, turno, blancas_ms, negras_ms, ultima_jugada_en, resultado, motivo, tablas_ofrecidas_por, vuelta_pedida_por"
      )
      .eq("id", inicial.id)
      .maybeSingle();
    if (data) aplicarFila(data as Record<string, unknown>);
  }, [aplicarFila, inicial.id]);

  /**
   * Relee varias veces, separando los intentos.
   *
   * Una sola lectura tras el empujón se adelanta a menudo a que el servidor haya
   * guardado —son varios viajes a la base—, y entonces no cambia nada y hay que
   * esperar al reintento normal. Tres intentos cortos cubren el caso sin castigar
   * a la base.
   */
  const releerConInsistencia = useCallback(() => {
    void releer();
    setTimeout(() => void releer(), 250);
    setTimeout(() => void releer(), 800);
  }, [releer]);

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
        /**
         * SOLO DIFUSIÓN EN ESTE CANAL, y esto es el arreglo de fondo.
         *
         * Antes escuchaba además los cambios de la tabla (`postgres_changes`) y no
         * llegaba NADA: ni las jugadas ni el chat. Medido después: la difusión
         * funciona sola —comprobada con clave anónima contra un canal limpio— y la
         * presencia también, porque van en canales sin escuchas de tabla. Lo que
         * mataba este canal era mezclar las dos cosas: si la RLS rechaza la parte de
         * `postgres_changes`, se cae la unión entera y con ella la difusión, que no
         * tenía ninguna culpa.
         *
         * Así que las escuchas de tabla se van. No se pierde nada: todo lo que la
         * partida necesita saber lo manda la acción de servidor por difusión.
         */
        .on("broadcast", { event: "cambio" }, (mensaje) => {
          const f = (mensaje.payload as { fila?: Record<string, unknown> })?.fila;
          if (!f) return;
          setEnVivo("si");
          antesJugadas.current = ((f.jugadas as string[]) ?? []).length;
          aplicarFila(f);
        })
        /**
         * EL RIVAL HA MOVIDO, y manda la jugada.
         *
         * Es lo que hace que se vea al instante. Antes el mensaje solo decía "mira la
         * fila", y entonces el retardo era el viaje a la base MÁS lo que tardara la
         * acción de servidor en haber guardado: seguía sin ir fino.
         *
         * QUÉ SE FÍA Y QUÉ NO, que es lo importante: la jugada que llega se
         * **comprueba aquí** contra la posición propia con las mismas reglas. Si no
         * es legal, se tira. Y sea legal o no, la posición de verdad sigue siendo la
         * de la base: la relectura que va detrás la confirma o la corrige.
         *
         * Queda una ventana de menos de un segundo en la que un socio podría enseñar
         * al rival una jugada legal que no ha jugado. Entre dos socios identificados
         * de un club, y corrigiéndose sola, es un precio asumible por jugar fino.
         */
        .on("broadcast", { event: "movio" }, (mensaje) => {
          setEnVivo("si");
          const san = (mensaje.payload as { san?: string })?.san;
          if (san) aplicarJugadaSuelta(san);
          // Y detrás, la de verdad: se reintenta hasta que el servidor haya
          // guardado, sin dejarlo en una sola lectura que puede llegar antes.
          void releerConInsistencia();
        })
        .on("broadcast", { event: "chat" }, (mensaje) => {
          const m = (mensaje.payload as { mensaje?: Mensaje })?.mensaje;
          if (!m) return;
          setEnVivo("si");
          setMensajes((antes) => (antes.some((x) => x.id === m.id) ? antes : [...antes, m]));
        })
        .subscribe((estado) => {
          if (cancelado) return;
          if (estado !== "SUBSCRIBED") setEnVivo("no");
        });
      canalRef.current = canal;
      cerrar = () => {
        canalRef.current = null;
        void supabase.removeChannel(canal);
      };
    });

    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [aplicarFila, aplicarJugadaSuelta, p.id, releerConInsistencia]);

  // RED DE SEGURIDAD del tiempo real: se recarga la fila cada dos segundos mientras
  // la partida está viva. Si el aviso llegó, esto no cambia nada; si se perdió,
  // evita quedarte mirando un tablero que ya no es el de la partida —que es lo que
  // obligaba a recargar a mano.
  useEffect(() => {
    if (p.resultado !== null) return;
    const supabase = createClient();
    // Con la difusión funcionando esto vuelve a ser lo que debe ser: una red, no el
    // motor. Se deja algo más corto mientras esperas al rival por si un mensaje se
    // pierde, pero ya no es lo que marca el ritmo de la partida.
    const cada = meToca ? 3000 : 1500;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("live_games")
        .select(
          "jugadas, turno, blancas_ms, negras_ms, ultima_jugada_en, resultado, motivo, tablas_ofrecidas_por, vuelta_pedida_por"
        )
        .eq("id", p.id)
        .maybeSingle();
      if (!data) return;
      // Si la novedad la pilla el reintento y no la difusión, la partida se está
      // sosteniendo a base de repreguntar: se dice, para no vender fluidez que no hay.
      if ((data.jugadas ?? []).length > antesJugadas.current) setEnVivo("no");
      aplicarFila(data as Record<string, unknown>);
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
  }, [aplicarFila, p.id, p.resultado, meToca]);

  // La cuenta atrás. Cada décima porque en los últimos segundos se ven décimas; en
  // cuanto la partida acaba se para, que si no sigue restando sobre un resultado.
  useEffect(() => {
    if (!enJuego) return;
    const t = setInterval(() => setAhora(performance.now()), 100);
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

  // El reloj se pinta con tiempo MEDIDO EN LOCAL desde que llegó el estado, no con
  // la marca del servidor. `arrancado` distingue la partida que aún no ha empezado
  // —donde nadie gasta tiempo— de la que ya corre.
  const arrancado = p.ultimaJugadaEn !== null;
  const reloj: Reloj = {
    blancasMs: p.blancasMs,
    negrasMs: p.negrasMs,
    turno: p.turno,
    ultimaJugadaEn: arrancado ? 0 : null,
  };
  const transcurrido = arrancado ? ahora - recibidoEn : 0;
  const tiempos = enJuego
    ? paraPintar(reloj, transcurrido)
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

    // EL RELOJ TAMBIÉN SE ADELANTA, con la misma cuenta que hará el servidor, pero
    // midiendo lo pensado EN LOCAL: desde que llegó el último estado hasta ahora.
    // Mezclar aquí la marca del servidor era lo que hacía temblar el número.
    const pensado = antes.ultimaJugadaEn === null ? 0 : performance.now() - recibidoEn;
    const relojTrasMover = trasJugada(
      {
        blancasMs: antes.blancasMs,
        negrasMs: antes.negrasMs,
        turno: antes.turno,
        ultimaJugadaEn: antes.ultimaJugadaEn === null ? null : 0,
      },
      { baseMs: antes.baseMs, incrementoMs: antes.incrementoMs },
      pensado
    );

    jugadasFirmes.current = antes.jugadas.length + 1;
    antesJugadas.current = antes.jugadas.length + 1;
    setRecibidoEn(performance.now());
    setP((estado) => ({
      ...estado,
      jugadas: [...estado.jugadas, san],
      turno: relojTrasMover.turno,
      blancasMs: relojTrasMover.blancasMs,
      negrasMs: relojTrasMover.negrasMs,
      // La marca solo dice "el reloj ya corre"; para pintar manda `recibidoEn`.
      ultimaJugadaEn: new Date().toISOString(),
      // Mover mata cualquier oferta de tablas viva, igual que en el servidor.
      tablasOfrecidasPor: null,
    }));

    // Se avisa al rival ANTES de que el servidor conteste, y con la jugada dentro:
    // es lo que quita el retardo de la cadena entera. Si el servidor la rechaza, la
    // relectura del otro lado devolverá la posición buena.
    void canalRef.current?.send({ type: "broadcast", event: "movio", payload: { san } });

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
    const { data, error: e } = await supabase
      .from("live_chat")
      .insert({ live_game_id: p.id, player_id: yo, texto: limpio })
      .select("id, player_id, texto, creado_en")
      .single();
    if (e || !data) {
      setError("No se ha podido mandar el mensaje.");
      return;
    }
    const mensaje: Mensaje = {
      id: data.id,
      playerId: data.player_id,
      texto: data.texto,
      creadoEn: data.creado_en,
    };
    // Se pinta al momento en el propio chat y se difunde al rival: el mensaje lo
    // escribe el navegador, así que el aviso sale de aquí y no del servidor.
    setMensajes((antes) => (antes.some((x) => x.id === mensaje.id) ? antes : [...antes, mensaje]));
    void canalRef.current?.send({ type: "broadcast", event: "chat", payload: { mensaje } });
  }

  const arriba = miColor === "b" ? "blancas" : "negras";
  const nombreArriba = arriba === "blancas" ? p.blancasNombre : p.negrasNombre;
  const nombreAbajo = arriba === "blancas" ? p.negrasNombre : p.blancasNombre;
  const msArriba = arriba === "blancas" ? tiempos.blancasMs : tiempos.negrasMs;
  const msAbajo = arriba === "blancas" ? tiempos.negrasMs : tiempos.blancasMs;
  const turnoArriba = arriba === "blancas" ? p.turno === "w" : p.turno === "b";

  const meOfrecenTablas =
    enJuego && p.tablasOfrecidasPor !== null && p.tablasOfrecidasPor !== yo && miColor !== null;
  const mePidenVolver =
    enJuego && p.vueltaPedidaPor !== null && p.vueltaPedidaPor !== yo && miColor !== null;
  // Volver una jugada solo la pide quien la hizo, o sea el que NO tiene el turno.
  const puedoPedirVolver =
    enJuego && miColor !== null && !meToca && p.jugadas.length > 0 && p.vueltaPedidaPor === null;

  return (
    <>
      {p.resultado && !resumenCerrado && !yaVisto && (
        <Resumen
          partida={p}
          onCerrar={() => {
            setResumenCerrado(true);
            marcarVisto();
          }}
        />
      )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,32rem)_1fr]">
      <div className="space-y-2">
        {/* El aviso SOLO cuando se sabe que algo va mal. Antes salía nada más
            entrar, cuando lo normal es que todavía no haya llegado ninguna difusión
            porque nadie ha movido: parecía una avería y no lo era. */}
        {enJuego && enVivo === "no" && (
          <p className="px-1 text-xs text-tinta-suave">
            Sin conexión en vivo: las jugadas del rival tardan un momento en aparecer.
          </p>
        )}
        <Jugador
          nombre={nombreArriba}
          ficha={arriba === "blancas" ? p.blancasId : p.negrasId}
          ms={msArriba}
          corriendo={enJuego && turnoArriba}
        />
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
        <Jugador
          nombre={nombreAbajo}
          ficha={arriba === "blancas" ? p.negrasId : p.blancasId}
          ms={msAbajo}
          corriendo={enJuego && !turnoArriba}
        />
      </div>

      <div className="space-y-3">
        {/* El resumen SE QUEDA en la página cuando la partida acaba. La ventana sale
            una vez y se cierra, y sin esto una partida terminada no decía en ningún
            sitio cómo había acabado: había que deducirlo del tablero. */}
        {p.resultado && (
          <div className="rounded-2xl border border-borde-acento bg-tarjeta-suave p-4">
            <ContenidoResumen partida={p} />
          </div>
        )}

        {meOfrecenTablas && (
          <Oferta
            icono="½"
            titulo="Te ofrecen tablas"
            detalle="Si aceptas, la partida acaba en empate."
            onAceptar={() => void aceptarTablas(p.id)}
            onRechazar={() => void ofrecerTablas(p.id)}
          />
        )}

        {mePidenVolver && (
          <Oferta
            icono="↩"
            titulo="Quiere volver su última jugada"
            detalle="Suele ser un dedo mal puesto. Si aceptas, se deshace y le vuelve el turno; el tiempo gastado no se devuelve."
            onAceptar={() => void responderVolverJugada(p.id, true)}
            onRechazar={() => void responderVolverJugada(p.id, false)}
          />
        )}

        {p.vueltaPedidaPor === yo && enJuego && (
          <p className="rounded-xl bg-tarjeta-suave px-3 py-2 text-sm text-tinta-suave">
            Has pedido volver tu jugada. Esperando a que conteste.
          </p>
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
            {/* Volver la jugada no pide confirmación: no rompe nada, lo decide el
                rival, y pedirla sin querer solo cuesta un "no". */}
            {puedoPedirVolver && (
              <Boton
                variante="secundario"
                className="px-3 py-1.5 text-sm"
                onClick={() => void pedirVolverJugada(p.id)}
              >
                Volver jugada
              </Boton>
            )}
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
 * Lo que se cuenta de una partida acabada: quién ganó, cómo, con qué ELO jugaba
 * cada uno y el PGN para llevársela.
 *
 * VIVE APARTE porque se pinta en DOS SITIOS: la ventana que salta al terminar, y la
 * tarjeta que se queda fija en la página. Son el mismo contenido y tienen que decir
 * lo mismo; duplicarlo sería garantizar que un día dejan de coincidir.
 */
function ContenidoResumen({ partida }: { partida: Partida }) {
  const gana =
    partida.resultado === "1-0"
      ? partida.blancasNombre
      : partida.resultado === "0-1"
        ? partida.negrasNombre
        : null;
  const puntos = puntosDe(partida.resultado);

  return (
    <>
      <p className="text-lg font-bold text-tinta">{gana ? `Gana ${gana}` : "Tablas"}</p>
      <p className="text-sm text-tinta-suave">
        {partida.motivo ? (MOTIVOS[partida.motivo] ?? "").replace(/^por /, "Por ") : ""}
        {partida.motivo ? " · " : ""}
        {Math.round(partida.baseMs / 60_000)}+{Math.round(partida.incrementoMs / 1000)} ·{" "}
        {partida.jugadas.length} jugadas
      </p>

      {/* EL RESULTADO, AL LADO DE CADA NOMBRE: así se lee de un vistazo quién hizo
          qué, en vez de tener que traducir un "1-0" a personas. */}
      <ul className="mt-3 space-y-1.5">
        {(
          [
            { icono: "♙", nombre: partida.blancasNombre, elo: partida.blancasElo, punto: puntos.blancas },
            { icono: "♟", nombre: partida.negrasNombre, elo: partida.negrasElo, punto: puntos.negras },
          ] as const
        ).map((j) => (
          <li key={j.icono} className="flex items-center gap-2 rounded-xl bg-tarjeta px-3 py-2">
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
    </>
  );
}

/**
 * Resumen de la partida, al acabar, EN VENTANA.
 *
 * Sale UNA vez, al terminar, y es el momento en que se quiere leer eso y nada más.
 * Se cierra de tres maneras —la equis, el fondo y Escape—, porque después lo normal
 * es querer mirar la posición final; y al cerrarla el mismo resumen se queda en la
 * página, así que no se pierde nada.
 */
function Resumen({ partida, onCerrar }: { partida: Partida; onCerrar: () => void }) {
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
            <ContenidoResumen partida={partida} />
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
 * Lo que el rival te propone: tablas, volver una jugada.
 *
 * TARJETA Y NO UNA LÍNEA DE TEXTO con un enlace subrayado, que es como estaba. Esto
 * interrumpe una partida con el reloj corriendo: tiene que verse de un vistazo qué
 * te piden y qué pasa si dices que sí, y las dos respuestas tienen que estar ahí
 * mismo. Antes solo se podía aceptar, y para decir que no había que ignorarlo.
 */
function Oferta({
  icono,
  titulo,
  detalle,
  onAceptar,
  onRechazar,
}: {
  icono: string;
  titulo: string;
  detalle: string;
  onAceptar: () => void;
  onRechazar: () => void;
}) {
  return (
    <div className="entra-abajo rounded-2xl border border-borde-acento bg-tarjeta-suave p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-acento-fuerte text-lg font-bold text-sobre-acento"
        >
          {icono}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-tinta">{titulo}</p>
          <p className="text-sm text-tinta-suave">{detalle}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Boton variante="solido" className="flex-1 px-3 py-1.5 text-sm" onClick={onAceptar}>
          Aceptar
        </Boton>
        <Boton variante="secundario" className="px-3 py-1.5 text-sm" onClick={onRechazar}>
          No
        </Boton>
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
  ficha,
  ms,
  corriendo,
}: {
  nombre: string;
  ficha: string;
  ms: number;
  corriendo: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-borde bg-tarjeta px-3 py-2">
      {/* Saber si el rival sigue ahí es lo primero que se mira cuando tarda: sin
          esto, un abandono y un pensar largo se ven exactamente igual. */}
      <PuntoConectado ficha={ficha} />
      <span className="min-w-0 flex-1 truncate text-sm text-tinta">{nombre}</span>
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
