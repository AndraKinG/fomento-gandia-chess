"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { editarPartida, guardarPartida } from "./actions";
import { EditorTablero } from "@/components/ajedrez/EditorTablero";

export type TorneoOpcion = { id: string; nombre: string };
export type SocioOpcion = { id: string; nombre: string };

export type PartidaInicial = {
  id: string;
  fecha: string;
  ronda: string;
  rivalNombre: string;
  rivalId: string;
  rivalElo: string;
  miElo: string;
  color: string;
  resultado: string;
  tournamentId: string;
  torneoTexto: string;
  apertura: string;
  notas: string;
  pgn: string;
  /** No sale en el repositorio del club: solo la ve su dueño (migración 0039). */
  privada: boolean;
};

const VACIA: Omit<PartidaInicial, "id"> = {
  fecha: "",
  ronda: "",
  rivalNombre: "",
  rivalId: "",
  rivalElo: "",
  miElo: "",
  color: "blancas",
  resultado: "1",
  tournamentId: "",
  torneoTexto: "",
  apertura: "",
  notas: "",
  pgn: "",
  // Compartida por defecto: el repositorio existe para que el club pueda mirar las
  // partidas de todos, y esconderlas de serie lo dejaría vacío sin que nadie lo pida.
  privada: false,
};

export function FormularioPartida({
  torneos,
  socios,
  inicial,
  pairingId,
}: {
  torneos: TorneoOpcion[];
  socios: SocioOpcion[];
  /** Emparejamiento de torneo interno del que sale esta partida, si viene de uno.
   *  Al guardar se enlaza, para que la ficha del torneo lleve a las jugadas. */
  pairingId?: string;
  /** Valores de partida. Con `id` no vacio el formulario EDITA; sin el, crea. */
  inicial?: PartidaInicial;
}) {
  const v = inicial ?? VACIA;
  const [error, setError] = useState<string | null>(null);
  const [rivalId, setRivalId] = useState(v.rivalId);
  const [color, setColor] = useState(v.color);
  // Con PGN ya escrito se arranca en modo texto; si no, en tablero: quien no
  // tiene PGN es justo el caso que el tablero viene a resolver.
  const [modoPgn, setModoPgn] = useState<"tablero" | "texto">(v.pgn ? "texto" : "tablero");
  const [pgnTablero, setPgnTablero] = useState(v.pgn && false ? v.pgn : "");
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Tarjeta>
      {error && (
        <div className="mb-3">
          <Banner tipo="error">{error}</Banner>
        </div>
      )}
      <form
        className="flex flex-col gap-4"
        action={(fd) => {
          setError(null);
          const datos = {
            fecha: String(fd.get("fecha") ?? ""),
            ronda: String(fd.get("ronda") ?? ""),
            rivalNombre: String(fd.get("rivalNombre") ?? ""),
            rivalId: String(fd.get("rivalId") ?? ""),
            rivalElo: String(fd.get("rivalElo") ?? ""),
            miElo: String(fd.get("miElo") ?? ""),
            color: String(fd.get("color") ?? ""),
            resultado: String(fd.get("resultado") ?? ""),
            tournamentId: String(fd.get("tournamentId") ?? ""),
            torneoTexto: String(fd.get("torneoTexto") ?? ""),
            apertura: String(fd.get("apertura") ?? ""),
            notas: String(fd.get("notas") ?? ""),
            pgn: String(fd.get("pgn") ?? ""),
            // Una casilla sin marcar no viaja en el formulario: ausente es "no".
            privada: fd.get("privada") === "on",
          };
          startTransition(async () => {
            // Edita solo si hay un id de verdad: la pantalla de "nueva" pasa
            // valores iniciales (la fecha de hoy) sin id, y mirar solo si
            // `inicial` existe la habria hecho editar una partida inexistente.
            const r = inicial?.id
              ? await editarPartida(inicial.id, datos)
              : await guardarPartida({ ...datos, pairingId });
            if (r.error) {
              setError(r.error);
              return;
            }
            router.push(r.id ? `/club/partidas/${r.id}` : "/club/partidas");
          });
        }}
      >
        {/* EL TABLERO PRIMERO, antes que la fecha y el rival. Es lo que se viene a
            hacer aquí; los datos son etiquetas que se rellenan después. En escritorio
            va a la izquierda y el formulario al lado, así que los campos de texto se
            quedan en una columna estrecha, que es como mejor se rellenan. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,32rem)_1fr]">
          <div>
            {/* Las jugadas: en el tablero o pegando el PGN. El tablero va primero
                porque es el caso normal —una partida de tablero no tiene PGN hasta
                que alguien la escribe— y teclear "1. e4 e5" a mano es pedirle al
                socio que no la suba. */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-tinta">Las jugadas (opcional)</span>
              <div className="flex gap-2">
                <BotonModo
                  activo={modoPgn === "tablero"}
                  onClick={() => setModoPgn("tablero")}
                >
                  Meterlas en el tablero
                </BotonModo>
                <BotonModo activo={modoPgn === "texto"} onClick={() => setModoPgn("texto")}>
                  Pegar un PGN
                </BotonModo>
              </div>

              {modoPgn === "tablero" ? (
                <>
                  <p className="text-xs text-tinta-suave">
                    Toca la pieza y luego la casilla. Solo deja hacer jugadas legales, y
                    el PGN se escribe solo.
                  </p>
                  <EditorTablero
                    onCambio={setPgnTablero}
                    volteado={color === "negras"}
                  />
                  {/* Lo que se envía es el PGN que ha generado el tablero. */}
                  <input type="hidden" name="pgn" value={pgnTablero} />
                </>
              ) : (
                <Area
                  id="pgn"
                  etiqueta="PGN"
                  valor={v.pgn}
                  filas={6}
                  mono
                  marcador={'[Event "..."]\n1. e4 e5 2. Nf3 ...'}
                  ayuda="Si la tienes en Lichess o Chess.com, copia el PGN y pégalo aquí."
                />
              )}
            </div>

          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Campo id="fecha" etiqueta="Fecha" tipo="date" requerido valor={v.fecha} />
              <Campo id="ronda" etiqueta="Ronda (opcional)" tipo="number" valor={v.ronda} />
            </div>

            {/* El rival puede ser un socio (y entonces se enlaza, para poder cruzar
                los enfrentamientos internos) o cualquiera de fuera, que es el caso
                normal: se escribe el nombre a mano. */}
            <div className="flex flex-col gap-1">
              <label htmlFor="rivalId" className="text-sm font-medium text-tinta">
                ¿El rival es del club?
              </label>
              <select
                id="rivalId"
                name="rivalId"
                defaultValue={v.rivalId}
                onChange={(e) => setRivalId(e.target.value)}
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
              >
                <option value="">No, es de otro club</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            {rivalId === "" && (
              <Campo
                id="rivalNombre"
                etiqueta="Nombre del rival"
                requerido
                valor={v.rivalNombre}
                marcador="Apellidos, Nombre"
              />
            )}
            {rivalId !== "" && (
              // Si el rival es socio, el nombre sale de su ficha: se manda igual
              // porque la columna es obligatoria y es lo que se muestra en las listas.
              <input
                type="hidden"
                name="rivalNombre"
                value={socios.find((s) => s.id === rivalId)?.nombre ?? ""}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="color" className="text-sm font-medium text-tinta">
                  Tus piezas
                </label>
                <select
                  id="color"
                  name="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
                >
                  <option value="blancas">♙ Blancas</option>
                  <option value="negras">♟ Negras</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="resultado" className="text-sm font-medium text-tinta">
                  Resultado
                </label>
                <select
                  id="resultado"
                  name="resultado"
                  defaultValue={v.resultado}
                  className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
                >
                  <option value="1">Gané</option>
                  <option value="0.5">Tablas</option>
                  <option value="0">Perdí</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo id="miElo" etiqueta="Tu ELO (opcional)" tipo="number" valor={v.miElo} />
              <Campo
                id="rivalElo"
                etiqueta="ELO del rival (opcional)"
                tipo="number"
                valor={v.rivalElo}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="tournamentId" className="text-sm font-medium text-tinta">
                Torneo
              </label>
              <select
                id="tournamentId"
                name="tournamentId"
                defaultValue={v.tournamentId}
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
              >
                <option value="">Ninguno / lo escribo abajo</option>
                {torneos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-tinta-suave">
                Si no está en la lista, déjalo en blanco y escríbelo aquí:
              </p>
            </div>
            <Campo
              id="torneoTexto"
              etiqueta="Torneo (texto libre)"
              valor={v.torneoTexto}
              marcador="Interclubs, jornada 3"
            />

            <Campo
              id="apertura"
              etiqueta="Apertura (opcional)"
              valor={v.apertura}
              marcador="Siciliana, variante Najdorf"
            />

            <Area
              id="notas"
              etiqueta="Anotaciones (opcional)"
              valor={v.notas}
              filas={4}
              marcador="Qué pasó, dónde se decidió, qué aprendiste…"
            />

            {/* PRIVADA. La casilla va aquí abajo, junto a las anotaciones, porque es
                de la misma familia: lo que escribes para ti. Y sin marcar por defecto,
                que el repositorio es del club. */}
            <label className="flex items-start gap-3 rounded-xl border border-borde p-3">
              <input
                type="checkbox"
                name="privada"
                defaultChecked={v.privada}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#0369a1]"
              />
              <span className="text-sm">
                <span className="font-medium text-tinta">Solo para mí</span>
                <span className="block text-xs text-tinta-suave">
                  No sale en las partidas del club. La ves tú en “Mías”.
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <Boton variante="degradado" type="submit" disabled={pendiente} className="flex-1">
                {pendiente ? "Guardando…" : inicial?.id ? "Guardar cambios" : "Guardar partida"}
              </Boton>
              <Boton variante="secundario" onClick={() => router.back()} disabled={pendiente}>
                Cancelar
              </Boton>
            </div>
          </div>
        </div>
      </form>
    </Tarjeta>
  );
}

function BotonModo({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition duration-100 active:scale-[0.97] ${
        activo
          ? "bg-acento-fuerte text-sobre-acento"
          : "border border-borde bg-tarjeta text-tinta-suave hover:bg-tarjeta-suave"
      }`}
    >
      {children}
    </button>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  marcador,
  tipo = "text",
  requerido = false,
}: {
  id: string;
  etiqueta: string;
  valor?: string;
  marcador?: string;
  tipo?: "text" | "date" | "number";
  requerido?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        type={tipo}
        required={requerido}
        defaultValue={valor}
        placeholder={marcador}
        className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
      />
    </div>
  );
}

function Area({
  id,
  etiqueta,
  valor,
  marcador,
  filas,
  ayuda,
  mono = false,
}: {
  id: string;
  etiqueta: string;
  valor?: string;
  marcador?: string;
  filas: number;
  ayuda?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      <textarea
        id={id}
        name={id}
        rows={filas}
        defaultValue={valor}
        placeholder={marcador}
        className={`rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave ${
          mono ? "font-mono text-sm" : ""
        }`}
      />
      {ayuda && <p className="text-xs text-tinta-suave">{ayuda}</p>}
    </div>
  );
}
