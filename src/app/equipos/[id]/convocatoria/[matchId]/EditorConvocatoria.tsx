"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { ChipTablero } from "@/components/ui/ChipTablero";
import { ChipElo } from "@/components/ui/ChipElo";
import { FilaJugadorOF } from "@/components/ui/FilaJugadorOF";
import { colorDeTablero } from "@/lib/validador/colores";
import {
  validar,
  type ConfigEquipo,
  type ContextoClub,
  type Infraccion,
  type JugadorOrden,
  type TableroPropuesto,
} from "@/lib/validador";
import { guardarBorrador, publicarConvocatoria, despublicarConvocatoria } from "../actions";

type EstadoDisponibilidad = "disponible" | "no_disponible" | "duda";
const ICONOS_DISPONIBILIDAD: Record<EstadoDisponibilidad, string> = {
  disponible: "✅",
  no_disponible: "❌",
  duda: "🤔",
};

/** Selección en curso del modo "toca para asignar": o un hueco de tablero
 * esperando jugador, o un jugador esperando hueco (arts. brief Task 6). */
type Seleccion = { tipo: "tablero"; tablero: number } | { tipo: "jugador"; playerId: string } | null;

type Feedback = { tipo: "ok" | "error" | "aviso"; mensaje: string } | null;

function claveOrden(p: JugadorOrden): [number, number] {
  return [p.numero, p.bisIndex];
}

function ordenarPorFuerza(orden: JugadorOrden[]): JugadorOrden[] {
  return [...orden].sort((a, b) => {
    const [na, ba] = claveOrden(a);
    const [nb, bb] = claveOrden(b);
    return na - nb || ba - bb;
  });
}

function ContadorInfracciones({ errores, avisos }: { errores: number; avisos: number }) {
  const variante = errores > 0 ? "error" : avisos > 0 ? "aviso" : "ok";
  const estilos = {
    ok: "bg-tarjeta-suave text-acento-texto ring-borde-acento",
    error: "bg-red-50 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800",
    aviso: "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  } as const;
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${estilos[variante]}`}
    >
      {errores} infracci{errores === 1 ? "ón" : "ones"} · {avisos} aviso{avisos === 1 ? "" : "s"}
    </span>
  );
}

function LineaInfraccion({ infraccion }: { infraccion: Infraccion }) {
  const esError = infraccion.nivel === "error";
  return (
    <p
      className={`mt-1 text-xs ${
        esError ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
      }`}
    >
      {esError ? "⛔" : "⚠"} [{infraccion.articulo}] {infraccion.mensaje}
    </p>
  );
}

export function EditorConvocatoria({
  matchId,
  orden,
  config,
  ctx,
  esLocal,
  jugado,
  tablerosIniciales,
  estadoInicial,
  disponibilidad,
}: {
  matchId: string;
  orden: JugadorOrden[];
  config: ConfigEquipo;
  ctx: ContextoClub;
  esLocal: boolean;
  jugado: boolean;
  tablerosIniciales: TableroPropuesto[];
  estadoInicial: "borrador" | "publicada";
  disponibilidad: Record<string, EstadoDisponibilidad>;
}) {
  const router = useRouter();
  const [tableros, setTableros] = useState<TableroPropuesto[]>(tablerosIniciales);
  const [estado, setEstado] = useState<"borrador" | "publicada">(estadoInicial);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [guardando, iniciarGuardado] = useTransition();
  const [publicando, iniciarPublicacion] = useTransition();
  const [despublicando, iniciarDespublicacion] = useTransition();

  const porId = useMemo(() => new Map(orden.map((p) => [p.playerId, p])), [orden]);
  const ordenados = useMemo(() => ordenarPorFuerza(orden), [orden]);

  const infracciones = useMemo(() => validar(orden, tableros, config, ctx), [orden, tableros, config, ctx]);
  const erroresCount = infracciones.filter((i) => i.nivel === "error").length;
  const avisosCount = infracciones.filter((i) => i.nivel === "aviso").length;
  const estructuralesCount = infracciones.filter(
    (i) => i.nivel === "error" && i.articulo === "estructural"
  ).length;
  const infraccionesGlobales = infracciones.filter((i) => i.tablero === null);

  const asignadoPorTablero = useMemo(() => new Map(tableros.map((t) => [t.tablero, t.playerId])), [tableros]);
  const tableroPorJugador = useMemo(() => new Map(tableros.map((t) => [t.playerId, t.tablero])), [tableros]);

  // Solo lectura: la jornada ya está jugada (registro histórico, art. no
  // modificable) o la convocatoria sigue publicada (hay que despublicarla
  // explícitamente antes de tocar nada, igual que exige `guardarBorrador`).
  const soloLectura = jugado || estado === "publicada";

  function asignarJugadorATablero(playerId: string, tablero: number) {
    setTableros((prev) => {
      const sinPrevias = prev.filter((t) => t.playerId !== playerId && t.tablero !== tablero);
      return [...sinPrevias, { tablero, playerId }];
    });
    setSeleccion(null);
  }

  function alTocarTablero(tablero: number) {
    if (soloLectura) return;
    if (seleccion?.tipo === "jugador") {
      asignarJugadorATablero(seleccion.playerId, tablero);
      return;
    }
    setSeleccion((prev) => (prev?.tipo === "tablero" && prev.tablero === tablero ? null : { tipo: "tablero", tablero }));
  }

  function alTocarJugador(playerId: string) {
    if (soloLectura) return;
    if (seleccion?.tipo === "tablero") {
      asignarJugadorATablero(playerId, seleccion.tablero);
      return;
    }
    setSeleccion((prev) => (prev?.tipo === "jugador" && prev.playerId === playerId ? null : { tipo: "jugador", playerId }));
  }

  function quitarDeTablero(tablero: number) {
    if (soloLectura) return;
    setTableros((prev) => prev.filter((t) => t.tablero !== tablero));
    setSeleccion((prev) => (prev?.tipo === "tablero" && prev.tablero === tablero ? null : prev));
  }

  function onGuardar() {
    setFeedback(null);
    iniciarGuardado(async () => {
      const resultado = await guardarBorrador(matchId, tableros);
      if (resultado.error) {
        setFeedback({ tipo: "error", mensaje: resultado.error });
        return;
      }
      setFeedback({ tipo: "ok", mensaje: "Borrador guardado" });
      router.refresh();
    });
  }

  function onPublicar() {
    if (!window.confirm("¿Publicar la convocatoria? Se notificará a cada convocado con la app vinculada.")) return;
    setFeedback(null);
    iniciarPublicacion(async () => {
      const resultado = await publicarConvocatoria(matchId);
      if (resultado.error) {
        setFeedback({ tipo: "error", mensaje: resultado.error });
        return;
      }
      setEstado("publicada");
      setFeedback({
        tipo: "ok",
        mensaje: `Convocatoria publicada. Notificados: ${resultado.notificados ?? 0}`,
      });
      router.refresh();
    });
  }

  function onDespublicar() {
    if (!window.confirm("¿Despublicar la convocatoria para volver a editarla?")) return;
    setFeedback(null);
    iniciarDespublicacion(async () => {
      const resultado = await despublicarConvocatoria(matchId);
      if (resultado.error) {
        setFeedback({ tipo: "error", mensaje: resultado.error });
        return;
      }
      setEstado("borrador");
      setFeedback({ tipo: "ok", mensaje: "Convocatoria despublicada; ya puedes editarla" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {jugado && (
        <Banner tipo="aviso">Este encuentro ya está jugado; la convocatoria no se puede modificar.</Banner>
      )}
      {!jugado && estado === "publicada" && <Banner tipo="ok">Convocatoria publicada.</Banner>}
      {feedback && <Banner tipo={feedback.tipo}>{feedback.mensaje}</Banner>}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-tinta">Tableros</h2>
          <ContadorInfracciones errores={erroresCount} avisos={avisosCount} />
        </div>

        {infraccionesGlobales.length > 0 && (
          <Tarjeta compacta>
            {infraccionesGlobales.map((inf, i) => (
              <LineaInfraccion key={i} infraccion={inf} />
            ))}
          </Tarjeta>
        )}

        {Array.from({ length: config.numTableros }, (_, i) => i + 1).map((t) => {
          const playerId = asignadoPorTablero.get(t);
          const jugador = playerId ? porId.get(playerId) : undefined;
          const color = colorDeTablero(t, esLocal);
          const infraccionesTablero = infracciones.filter((inf) => inf.tablero === t);
          const seleccionado = seleccion?.tipo === "tablero" && seleccion.tablero === t;
          const noDisponible = playerId ? disponibilidad[playerId] === "no_disponible" : false;

          return (
            <Tarjeta
              key={t}
              compacta
              className={seleccionado ? "ring-2 ring-acento-fuerte" : ""}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={soloLectura}
                  onClick={() => alTocarTablero(t)}
                  className="flex flex-1 items-center gap-2 rounded-lg py-1 text-left disabled:cursor-default"
                >
                  <ChipTablero tablero={t} color={color} />
                  {jugador ? (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-tinta">{jugador.nombre}</span>
                  ) : (
                    <span className="flex-1 text-sm text-tinta-suave">Toca para asignar</span>
                  )}
                </button>
                {jugador && !soloLectura && (
                  <button
                    type="button"
                    aria-label={`Quitar a ${jugador.nombre} del tablero ${t}`}
                    onClick={() => quitarDeTablero(t)}
                    className="shrink-0 rounded-full px-2 py-1 text-tinta-suave hover:bg-tarjeta-suave"
                  >
                    ✕
                  </button>
                )}
              </div>
              {noDisponible && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  ⚠ Convocado pese a estar marcado como no disponible
                </p>
              )}
              {infraccionesTablero.map((inf, i) => (
                <LineaInfraccion key={i} infraccion={inf} />
              ))}
            </Tarjeta>
          );
        })}
      </section>

      {!soloLectura && (
        <div className="flex gap-2">
          <Boton
            variante="secundario"
            className="flex-1 text-sm"
            disabled={guardando || estructuralesCount > 0}
            onClick={onGuardar}
          >
            {guardando ? "Guardando…" : "Guardar borrador"}
          </Boton>
          <Boton
            variante="degradado"
            className="flex-1 text-sm"
            disabled={publicando || erroresCount > 0 || tableros.length === 0}
            onClick={onPublicar}
          >
            {publicando ? "Publicando…" : "Publicar convocatoria"}
          </Boton>
        </div>
      )}
      {!jugado && estado === "publicada" && (
        <Boton variante="secundario" className="w-full text-sm" disabled={despublicando} onClick={onDespublicar}>
          {despublicando ? "Despublicando…" : "Despublicar"}
        </Boton>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold text-tinta">Disponibles (orden de fuerza)</h2>
        <div className="space-y-2">
          {ordenados.map((j) => {
            const tableroAsignado = tableroPorJugador.get(j.playerId);
            const estadoDisp = disponibilidad[j.playerId];
            const seleccionado = seleccion?.tipo === "jugador" && seleccion.playerId === j.playerId;
            const noDisponible = estadoDisp === "no_disponible";
            return (
              <button
                key={j.playerId}
                type="button"
                disabled={soloLectura}
                onClick={() => alTocarJugador(j.playerId)}
                className={`block w-full rounded-2xl text-left transition disabled:cursor-default ${
                  seleccionado ? "ring-2 ring-acento-fuerte" : ""
                } ${noDisponible ? "opacity-60" : ""}`}
              >
                <FilaJugadorOF
                  numero={j.numero}
                  bisIndex={j.bisIndex}
                  nombre={j.nombre}
                  chips={
                    <>
                      <ChipElo valor={j.fuerza} etiqueta="Fuerza" />
                      <span aria-hidden className="text-sm">
                        {estadoDisp ? ICONOS_DISPONIBILIDAD[estadoDisp] : "—"}
                      </span>
                      {tableroAsignado !== undefined && (
                        <span className="rounded-full bg-acento-fuerte px-2 py-0.5 text-xs font-semibold text-sobre-acento">
                          Tablero {tableroAsignado}
                        </span>
                      )}
                    </>
                  }
                />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
