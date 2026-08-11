"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import {
  aPartidaImportada,
  separarPartidas,
  type PartidaImportada,
} from "@/lib/partidas/pgn";
import { importarPartidas, type FilaImportar } from "./actions";

type Candidata = PartidaImportada & { elegida: boolean; indice: number };

export function Importador({ miNombre }: { miNombre: string }) {
  const [texto, setTexto] = useState("");
  const [usuarios, setUsuarios] = useState("");
  const [candidatas, setCandidatas] = useState<Candidata[] | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "error" | "aviso"; texto: string } | null>(null);
  /** Importar en privado: se decide para toda la tanda (ver `importarPartidas`). */
  const [privadas, setPrivadas] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function analizar(pgnCompleto: string) {
    setAviso(null);
    const partidas = separarPartidas(pgnCompleto);
    if (partidas.length === 0) {
      setAviso({ tipo: "error", texto: "Ese fichero no parece tener partidas." });
      setCandidatas(null);
      return;
    }

    // El nombre del club más los usuarios que declare: la misma persona aparece
    // como "Martínez Ribes, Joan" en la FACV y como "joanribes" en Lichess.
    const nombres = [
      miNombre,
      ...usuarios.split(/[,\n]/).map((u) => u.trim()).filter(Boolean),
    ];

    const lista = partidas.map((p, i) => ({
      ...aPartidaImportada(p, nombres),
      // Se preseleccionan solo las reconocidas: importar una partida sin saber
      // qué color llevabas la guardaría con el resultado al revés.
      elegida: false,
      indice: i,
    }));
    const reconocidas = lista.map((c) => ({ ...c, elegida: c.reconocida }));

    setCandidatas(reconocidas);
    const sinReconocer = lista.filter((c) => !c.reconocida).length;
    if (sinReconocer > 0) {
      setAviso({
        tipo: "aviso",
        texto: `${sinReconocer} de ${lista.length} no se han podido asignar: no aparece tu nombre en ellas. Añade tu usuario de la plataforma arriba y vuelve a analizar.`,
      });
    }
  }

  function importar() {
    if (!candidatas) return;
    const filas: FilaImportar[] = candidatas
      .filter((c) => c.elegida && c.reconocida && c.fecha && c.rivalNombre && c.color && c.resultado)
      .map((c) => ({
        pgn: c.pgn,
        fecha: c.fecha!,
        rivalNombre: c.rivalNombre!,
        rivalElo: c.rivalElo,
        miElo: c.miElo,
        color: c.color!,
        resultado: c.resultado!,
        ronda: c.ronda,
        torneoTexto: c.torneoTexto,
      }));

    setAviso(null);
    startTransition(async () => {
      const r = await importarPartidas(filas, privadas);
      if (r.error) {
        setAviso({ tipo: "error", texto: r.error });
        return;
      }
      router.push("/club/partidas?mias=1");
    });
  }

  const elegidas = (candidatas ?? []).filter((c) => c.elegida).length;

  return (
    <div className="space-y-4">
      {aviso && <Banner tipo={aviso.tipo}>{aviso.texto}</Banner>}

      <Tarjeta>
        <p className="text-sm text-tinta">
          Descarga tus partidas de Lichess o Chess.com en un fichero{" "}
          <span className="font-mono text-xs">.pgn</span> y súbelo aquí. También
          puedes pegar el texto.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-tinta-suave">
          <li>
            <b className="font-semibold">Lichess:</b> Perfil → los tres puntos →
            Exportar partidas.
          </li>
          <li>
            <b className="font-semibold">Chess.com:</b> Perfil → Partidas →
            Descargar.
          </li>
        </ul>

        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor="usuarios" className="text-sm font-medium text-tinta">
            Tus usuarios en esas webs
          </label>
          <input
            id="usuarios"
            value={usuarios}
            onChange={(e) => setUsuarios(e.target.value)}
            placeholder="joanribes, joanchess"
            className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
          />
          <p className="text-xs text-tinta-suave">
            Hace falta para saber qué color llevabas en cada partida. Separa varios
            con comas.
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <input
            type="file"
            accept=".pgn,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const contenido = await f.text();
              setTexto(contenido);
              analizar(contenido);
            }}
            className="rounded-xl border border-borde bg-tarjeta p-3 text-sm text-tinta"
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder="…o pega aquí el contenido del PGN"
            className="rounded-xl border border-borde bg-tarjeta p-3 font-mono text-xs text-tinta placeholder:font-sans placeholder:text-tinta-suave"
          />
          <Boton variante="solido" onClick={() => analizar(texto)} disabled={!texto.trim()}>
            Analizar
          </Boton>
        </div>
      </Tarjeta>

      {candidatas && (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-sm text-tinta">
              {candidatas.length} partidas · <b className="font-semibold">{elegidas}</b>{" "}
              elegidas
            </p>
            <button
              type="button"
              onClick={() =>
                setCandidatas(
                  candidatas.map((c) => ({
                    ...c,
                    elegida: c.reconocida && elegidas < candidatas.filter((x) => x.reconocida).length,
                  }))
                )
              }
              className="text-sm text-acento-texto underline"
            >
              {elegidas === candidatas.filter((c) => c.reconocida).length
                ? "Quitar todas"
                : "Elegir todas"}
            </button>
          </div>

          <ul className="space-y-2">
            {candidatas.map((c) => (
              <li key={c.indice}>
                <Tarjeta compacta destacada={c.elegida}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={c.elegida}
                      disabled={!c.reconocida}
                      onChange={(e) =>
                        setCandidatas(
                          candidatas.map((x) =>
                            x.indice === c.indice ? { ...x, elegida: e.target.checked } : x
                          )
                        )
                      }
                      className="mt-1 h-5 w-5 shrink-0 accent-[#0369a1]"
                    />
                    <div className="min-w-0">
                      {c.reconocida ? (
                        <>
                          <p className="truncate text-sm text-tinta">
                            vs <b className="font-semibold">{c.rivalNombre}</b>
                            {c.rivalElo ? (
                              <span className="text-tinta-suave"> ({c.rivalElo})</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-tinta-suave">
                            {c.fecha ?? "sin fecha"} ·{" "}
                            {c.color === "blancas" ? "♙ blancas" : "♟ negras"} ·{" "}
                            {c.resultado === "1"
                              ? "ganaste"
                              : c.resultado === "0"
                                ? "perdiste"
                                : "tablas"}
                            {c.torneoTexto ? ` · ${c.torneoTexto}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-tinta-suave">
                          No se sabe qué color llevabas: tu nombre no aparece en esta
                          partida.
                        </p>
                      )}
                      {c.reconocida && !c.fecha && (
                        <p className="text-xs text-red-700 dark:text-red-400">
                          Sin fecha usable: no se puede importar.
                        </p>
                      )}
                    </div>
                  </label>
                </Tarjeta>
              </li>
            ))}
          </ul>

          {/* Para toda la tanda: quien trae 80 partidas de Lichess las quiere todas
              igual, y una casilla por fila sería un formulario imposible. */}
          <label className="flex items-start gap-3 rounded-xl border border-borde p-3">
            <input
              type="checkbox"
              checked={privadas}
              onChange={(e) => setPrivadas(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#0369a1]"
            />
            <span className="text-sm">
              <span className="font-medium text-tinta">Solo para mí</span>
              <span className="block text-xs text-tinta-suave">
                No salen en las partidas del club. Las ves tú en “Mías”.
              </span>
            </span>
          </label>

          <Boton
            variante="degradado"
            className="w-full"
            onClick={importar}
            disabled={pendiente || elegidas === 0}
          >
            {pendiente ? "Importando…" : `Importar ${elegidas} partidas`}
          </Boton>
        </>
      )}
    </div>
  );
}
