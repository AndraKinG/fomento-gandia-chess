"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clienteEnVivo } from "@/lib/supabase/vivo";
import Link from "next/link";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { jugarEmparejamiento } from "@/app/club/(vinculado)/jugar/actions";
import { Mirando } from "@/components/presencia/Mirando";
import {
  anotarResultado,
  borrarUltimaRonda,
  cambiarEstadoTorneo,
  cambiarInscripcion,
  generarRonda,
} from "../actions";

export type ParVista = {
  id: string;
  mesa: number;
  blancasNombre: string;
  negrasNombre: string;
  resultado: "1" | "0.5" | "0" | null;
  /** true si el socio que mira jugo esta partida: solo el puede subir sus jugadas. */
  esMia: boolean;
  /** Partida del repositorio ya enlazada, si la subio. */
  gameId: string | null;
};

export type RondaVista = {
  numero: number;
  descansaNombre: string | null;
  pares: ParVista[];
};

export type SocioVista = { ficha: string; nombre: string; inscrito: boolean; elo: number };

export function GestionTorneo({
  tournamentId,
  estado,
  sistema,
  rondas,
  rondasTotales,
  socios,
  esJunta,
}: {
  tournamentId: string;
  estado: "inscripcion" | "en_curso" | "terminado";
  sistema: "liguilla" | "suizo";
  rondas: RondaVista[];
  rondasTotales: number | null;
  socios: SocioVista[];
  esJunta: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [abriendoInscritos, setAbriendoInscritos] = useState(false);
  // Guarda el NÚMERO de ronda, no la posición, y null significa "la última". Así
  // generar una ronda nueva la enseña sola, y borrar la última no deja el selector
  // apuntando a una ronda que ya no existe.
  const [rondaPinchada, setRondaPinchada] = useState<number | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function ejecutar(accion: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  /**
   * EL TORNEO EN DIRECTO: cuando una partida en vivo termina, el servidor
   * difunde al canal `torneo-<id>` (cerrarEnElTorneo) y esta pantalla se rehace
   * sola — resultados y clasificación al momento, sin recargar. Sin esto, con
   * el club jugando una tarde de torneo online, quien miraba la clasificación
   * la veía congelada. Canal público sin datos: solo "mira otra vez".
   */
  useEffect(() => {
    let cerrar: (() => void) | null = null;
    let cancelado = false;
    void clienteEnVivo().then(({ supabase }) => {
      if (cancelado) return;
      const canal = supabase
        .channel(`torneo-${tournamentId}`)
        .on("broadcast", { event: "resultado" }, () => router.refresh())
        .subscribe();
      cerrar = () => void supabase.removeChannel(canal);
    });
    return () => {
      cancelado = true;
      cerrar?.();
    };
  }, [tournamentId, router]);

  const inscritos = socios.filter((s) => s.inscrito);
  const faltanResultados = rondas.some((r) => r.pares.some((p) => p.resultado === null));
  const rondasHechas = rondas.length;
  const quedanRondas = rondasTotales === null || rondasHechas < rondasTotales;
  const rondaActual =
    rondas.find((r) => r.numero === rondaPinchada) ?? rondas[rondas.length - 1] ?? null;

  return (
    <div className="space-y-4">
      <Mirando sala={`torneo-${tournamentId}`} />
      {error && <Banner tipo="error">{error}</Banner>}

      {/* ---- Inscritos ---- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Inscritos ({inscritos.length})
          </h2>
          {esJunta && estado === "inscripcion" && (
            <button
              type="button"
              onClick={() => setAbriendoInscritos((v) => !v)}
              className="text-sm text-acento-texto underline"
            >
              {abriendoInscritos ? "Listo" : "Cambiar"}
            </button>
          )}
        </div>

        {inscritos.length === 0 && (
          <Tarjeta compacta>
            <p className="text-sm text-tinta-suave">
              Todavía no hay nadie inscrito.
              {esJunta && estado === "inscripcion" ? " Pulsa Cambiar para apuntar gente." : ""}
            </p>
          </Tarjeta>
        )}

        {!abriendoInscritos && inscritos.length > 0 && (
          <Tarjeta compacta>
            <p className="text-sm text-tinta">
              {inscritos.map((s) => s.nombre).join(" · ")}
            </p>
          </Tarjeta>
        )}

        {abriendoInscritos && (
          <Tarjeta>
            <p className="mb-2 text-xs text-tinta-suave">
              El ELO de partida de cada uno sale de su ELO oficial. La lista se cierra
              al generar la primera ronda.
            </p>
            <ul className="max-h-72 space-y-1 overflow-auto">
              {socios.map((s) => (
                <li key={s.ficha}>
                  <label className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-tarjeta-suave">
                    <input
                      type="checkbox"
                      checked={s.inscrito}
                      disabled={pendiente}
                      onChange={(e) =>
                        ejecutar(() =>
                          cambiarInscripcion(tournamentId, s.ficha, e.target.checked)
                        )
                      }
                      className="h-5 w-5 accent-[#0369a1]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                      {s.nombre}
                    </span>
                    <span className="shrink-0 text-xs text-tinta-suave">{s.elo}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </section>

      {/* ---- Rondas ----
          UNA RONDA A LA VISTA, en una caja de filas como el calendario de Interclubs.
          Antes era una tarjeta de dos líneas por cruce y todas las rondas seguidas:
          un suizo de diez con cinco rondas son veinticinco tarjetas, la página no se
          acababa nunca y la clasificación —que es lo que se mira— quedaba a un scroll.
          Y crece sola: con once rondas serían cincuenta y cinco cruces. Cada cruce
          cabe ahora en una línea porque el color lo dicen el orden y los símbolos. */}
      {rondaActual && (
        <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Ronda {rondaActual.numero}
            {rondasTotales ? (
              <span className="font-normal normal-case"> de {rondasTotales}</span>
            ) : null}
          </h2>
          {/* SELECTOR DE RONDA, una a la vista. Todas seguidas estiraban la página
              hasta dejar fuera lo que se mira, que es la clasificación, y encima
              crece sola: un suizo de once rondas serían cincuenta y cinco cruces. */}
          {rondas.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {rondas.map((r) => {
                const faltan = r.pares.some((p) => p.resultado === null);
                return (
                  <button
                    key={r.numero}
                    type="button"
                    onClick={() => setRondaPinchada(r.numero)}
                    aria-current={r.numero === rondaActual.numero ? "true" : undefined}
                    className={`h-7 w-7 rounded-lg text-xs font-semibold tabular-nums transition duration-100 active:scale-[0.97] ${
                      r.numero === rondaActual.numero
                        ? "bg-acento-fuerte text-sobre-acento"
                        : "border border-borde bg-tarjeta text-tinta-suave hover:bg-tarjeta-suave"
                    }`}
                    // El punto marca las rondas a las que les falta algún resultado:
                    // sin esto, esconder las demás obliga a ir mirándolas una a una.
                    title={faltan ? `Ronda ${r.numero}, faltan resultados` : `Ronda ${r.numero}`}
                  >
                    {r.numero}
                    {faltan && <span aria-hidden>·</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
          {rondaActual.descansaNombre && (
            <p className="border-b border-borde bg-tarjeta-suave px-3 py-1.5 text-xs text-tinta-suave">
              Descansa {rondaActual.descansaNombre} (+½)
            </p>
          )}
          <ul className="divide-y divide-borde">
            {rondaActual.pares.map((p) => (
              <li
                key={p.id}
                // Dos líneas en móvil y una desde `sm`: con los tres botones de
                // resultado al lado, dos nombres largos se quedaban en tres letras.
                className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-tinta-suave">
                    {p.mesa}
                  </span>
                  <span className="min-w-0 truncate text-sm text-tinta">
                    <span aria-hidden className="text-tinta-suave">
                      ♙
                    </span>{" "}
                    {p.blancasNombre}
                    <span className="text-tinta-suave"> · </span>
                    <span aria-hidden className="text-tinta-suave">
                      ♟
                    </span>{" "}
                    {p.negrasNombre}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                  {/* El enlace a las jugadas va en la fila de SU cruce, no suelto
                      debajo de la ronda: así se sabe de qué partida habla. */}
                  {/* JUGARLA EN LA APP, mientras no tenga resultado y solo si es
                      tuya. Ni los colores ni la cadencia se eligen aquí: los pone
                      el torneo. */}
                  {p.esMia && p.resultado === null && estado !== "terminado" && (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        ejecutar(async () => {
                          const r = await jugarEmparejamiento(p.id);
                          if (r.id) router.push(`/club/jugar/${r.id}`);
                          return r;
                        })
                      }
                      className="text-xs font-semibold text-acento-texto underline disabled:opacity-50"
                    >
                      Jugar aquí
                    </button>
                  )}
                  {p.esMia && p.resultado !== null && (
                    <Link
                      href={
                        p.gameId
                          ? `/club/partidas/${p.gameId}`
                          : `/club/partidas/nueva?emparejamiento=${p.id}`
                      }
                      title={
                        p.gameId ? "Ver tus jugadas" : "Subir tus jugadas"
                      }
                      className="text-xs text-acento-texto underline"
                    >
                      {p.gameId ? "Ver jugadas" : "Subir jugadas"}
                    </Link>
                  )}
                  {esJunta && estado !== "terminado" ? (
                    <span className="flex gap-1">
                      {(["1", "0.5", "0"] as const).map((valor) => (
                        <button
                          key={valor}
                          type="button"
                          disabled={pendiente}
                          onClick={() =>
                            ejecutar(() =>
                              anotarResultado(
                                tournamentId,
                                p.id,
                                p.resultado === valor ? null : valor
                              )
                            )
                          }
                          aria-pressed={p.resultado === valor}
                          aria-label={
                            valor === "1"
                              ? "Ganan blancas"
                              : valor === "0.5"
                                ? "Tablas"
                                : "Ganan negras"
                          }
                          className={`w-10 rounded-lg px-1 py-1 text-xs font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-50 ${
                            p.resultado === valor
                              ? "bg-acento-fuerte text-sobre-acento"
                              : "border border-borde bg-tarjeta text-tinta-suave"
                          }`}
                        >
                          {valor === "1" ? "1-0" : valor === "0.5" ? "½" : "0-1"}
                        </button>
                      ))}
                    </span>
                  ) : (
                    // Ancho fijo para que los resultados queden en columna: en una
                    // lista larga, cifras que bailan de sitio obligan a buscarlas.
                    <span
                      className={`w-16 text-right text-sm font-semibold tabular-nums ${
                        p.resultado === null ? "text-tinta-suave" : "text-tinta"
                      }`}
                    >
                      {p.resultado === "1"
                        ? "1-0"
                        : p.resultado === "0.5"
                          ? "½-½"
                          : p.resultado === "0"
                            ? "0-1"
                            : "—"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        </section>
      )}

      {/* ---- Acciones del organizador ---- */}
      {esJunta && estado !== "terminado" && (
        <div className="space-y-2 pt-2">
          {quedanRondas ? (
            <Boton
              variante="degradado"
              className="w-full"
              disabled={pendiente || inscritos.length < 2 || faltanResultados}
              onClick={() => ejecutar(() => generarRonda(tournamentId))}
            >
              {pendiente ? "Trabajando…" : `Generar ronda ${rondasHechas + 1}`}
            </Boton>
          ) : (
            <p className="px-1 text-sm text-tinta-suave">
              El torneo ya tiene sus {rondasTotales} rondas.
            </p>
          )}

          {faltanResultados && (
            <p className="px-1 text-xs text-tinta-suave">
              Falta anotar resultados: no se puede emparejar la ronda siguiente con
              datos a medias.
            </p>
          )}
          {inscritos.length < 2 && (
            <p className="px-1 text-xs text-tinta-suave">
              Hacen falta al menos dos inscritos.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {rondasHechas > 0 && (
              <Boton
                variante="secundario"
                className="text-sm"
                disabled={pendiente}
                onClick={() => ejecutar(() => borrarUltimaRonda(tournamentId))}
              >
                Borrar ronda {rondasHechas}
              </Boton>
            )}
            {rondasHechas > 0 && !faltanResultados && (
              <Boton
                variante="secundario"
                className="text-sm"
                disabled={pendiente}
                onClick={() => ejecutar(() => cambiarEstadoTorneo(tournamentId, "terminado"))}
              >
                Cerrar el torneo
              </Boton>
            )}
          </div>
          {sistema === "suizo" && rondasHechas > 0 && (
            <p className="px-1 text-xs text-tinta-suave">
              En un suizo puedes cerrar cuando quieras, no hace falta agotar las rondas.
            </p>
          )}
        </div>
      )}

      {esJunta && estado === "terminado" && (
        <Boton
          variante="secundario"
          className="w-full text-sm"
          disabled={pendiente}
          onClick={() => ejecutar(() => cambiarEstadoTorneo(tournamentId, "en_curso"))}
        >
          Reabrir el torneo
        </Boton>
      )}
    </div>
  );
}
