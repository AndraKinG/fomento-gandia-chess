"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { editarPartida, guardarPartida } from "./actions";

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
};

export function FormularioPartida({
  torneos,
  socios,
  inicial,
}: {
  torneos: TorneoOpcion[];
  socios: SocioOpcion[];
  /** Valores de partida. Con `id` no vacio el formulario EDITA; sin el, crea. */
  inicial?: PartidaInicial;
}) {
  const v = inicial ?? VACIA;
  const [error, setError] = useState<string | null>(null);
  const [rivalId, setRivalId] = useState(v.rivalId);
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
          };
          startTransition(async () => {
            // Edita solo si hay un id de verdad: la pantalla de "nueva" pasa
            // valores iniciales (la fecha de hoy) sin id, y mirar solo si
            // `inicial` existe la habria hecho editar una partida inexistente.
            const r = inicial?.id
              ? await editarPartida(inicial.id, datos)
              : await guardarPartida(datos);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.push(r.id ? `/club/partidas/${r.id}` : "/club/partidas");
          });
        }}
      >
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
              defaultValue={v.color}
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

        <Area
          id="pgn"
          etiqueta="PGN (opcional)"
          valor={v.pgn}
          filas={6}
          mono
          marcador={'[Event "..."]\n1. e4 e5 2. Nf3 ...'}
          ayuda="Si la tienes en Lichess o Chess.com, copia el PGN y pégalo aquí."
        />

        <div className="flex gap-2">
          <Boton variante="degradado" type="submit" disabled={pendiente} className="flex-1">
            {pendiente ? "Guardando…" : inicial?.id ? "Guardar cambios" : "Guardar partida"}
          </Boton>
          <Boton variante="secundario" onClick={() => router.back()} disabled={pendiente}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
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
