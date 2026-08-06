"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
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

  const inscritos = socios.filter((s) => s.inscrito);
  const faltanResultados = rondas.some((r) => r.pares.some((p) => p.resultado === null));
  const rondasHechas = rondas.length;
  const quedanRondas = rondasTotales === null || rondasHechas < rondasTotales;

  return (
    <div className="space-y-4">
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

      {/* ---- Rondas ---- */}
      {rondas.map((r) => (
        <section key={r.numero} className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Ronda {r.numero}
          </h2>
          {r.pares.map((p) => (
            <Tarjeta key={p.id} compacta>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-tinta">
                    <span aria-hidden>♙</span> {p.blancasNombre}
                  </p>
                  <p className="truncate text-sm text-tinta">
                    <span aria-hidden>♟</span> {p.negrasNombre}
                  </p>
                </div>
                {esJunta && estado !== "terminado" ? (
                  <div className="flex shrink-0 gap-1">
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
                        className={`w-10 rounded-xl px-1 py-1.5 text-xs font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-50 ${
                          p.resultado === valor
                            ? "bg-acento-fuerte text-sobre-acento"
                            : "border border-borde bg-tarjeta text-tinta-suave"
                        }`}
                      >
                        {valor === "1" ? "1-0" : valor === "0.5" ? "½" : "0-1"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-semibold text-acento-texto ring-1 ring-borde-acento">
                    {p.resultado === "1"
                      ? "1-0"
                      : p.resultado === "0.5"
                        ? "½-½"
                        : p.resultado === "0"
                          ? "0-1"
                          : "por jugar"}
                  </span>
                )}
              </div>
            </Tarjeta>
          ))}
          {r.pares.some((p) => p.esMia && p.resultado !== null) && (
            <p className="px-1 text-xs text-tinta-suave">
              {r.pares
                .filter((p) => p.esMia && p.resultado !== null)
                .map((p) =>
                  p.gameId ? (
                    <Link
                      key={p.id}
                      href={`/club/partidas/${p.gameId}`}
                      className="text-acento-texto underline"
                    >
                      Ver tus jugadas de esta ronda
                    </Link>
                  ) : (
                    <Link
                      key={p.id}
                      href={`/club/partidas/nueva?emparejamiento=${p.id}`}
                      className="text-acento-texto underline"
                    >
                      Subir tus jugadas de esta ronda
                    </Link>
                  )
                )}
            </p>
          )}
          {r.descansaNombre && (
            <p className="px-1 text-xs text-tinta-suave">
              Descansa {r.descansaNombre} (suma medio punto)
            </p>
          )}
        </section>
      ))}

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
