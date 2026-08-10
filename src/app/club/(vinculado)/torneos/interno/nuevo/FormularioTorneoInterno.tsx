"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { crearTorneoInterno } from "../actions";
import { ElegirCadencia, type Cadencia } from "@/components/ajedrez/Cadencia";

export function FormularioTorneoInterno() {
  const [error, setError] = useState<string | null>(null);
  const [sistema, setSistema] = useState("suizo");
  const [cadencia, setCadencia] = useState<Cadencia>({ baseMin: 10, incrementoS: 5 });
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
          startTransition(async () => {
            const r = await crearTorneoInterno({
              nombre: String(fd.get("nombre") ?? ""),
              sistema: String(fd.get("sistema") ?? ""),
              baseMin: cadencia.baseMin,
              incrementoS: cadencia.incrementoS,
              fechaInicio: String(fd.get("fechaInicio") ?? ""),
              notas: String(fd.get("notas") ?? ""),
            });
            if (r.error) {
              setError(r.error);
              return;
            }
            router.push(`/club/torneos/interno/${r.id}`);
          });
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="nombre" className="text-sm font-medium text-tinta">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            placeholder="Torneo de Navidad 2026"
            className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tinta">Sistema de juego</span>
          <div className="flex gap-2">
            <Opcion
              activo={sistema === "suizo"}
              onClick={() => setSistema("suizo")}
              titulo="Suizo"
              detalle="Para muchos jugadores. Cada ronda empareja por puntuación."
            />
            <Opcion
              activo={sistema === "liguilla"}
              onClick={() => setSistema("liguilla")}
              titulo="Liguilla"
              detalle="Todos contra todos. Para grupos pequeños."
            />
          </div>
          <input type="hidden" name="sistema" value={sistema} />
          <p className="text-xs text-tinta-suave">
            {sistema === "suizo"
              ? "Las rondas se calculan según los inscritos, y se puede parar cuando quieras."
              : "El calendario sale entero al generar la primera ronda: N−1 rondas con N jugadores."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tinta">Ritmo de juego</span>
          <ElegirCadencia valor={cadencia} onCambiar={setCadencia} />
          <p className="text-xs text-tinta-suave">
            Todas las partidas del torneo se juegan a este ritmo.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fechaInicio" className="text-sm font-medium text-tinta">
            Fecha de inicio (opcional)
          </label>
          <input
            id="fechaInicio"
            name="fechaInicio"
            type="date"
            className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notas" className="text-sm font-medium text-tinta">
            Notas (opcional)
          </label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            placeholder="Ritmo, día de la semana, premios…"
            className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
          />
        </div>

        <Boton variante="degradado" type="submit" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear torneo"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

function Opcion({
  activo,
  onClick,
  titulo,
  detalle,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex-1 rounded-xl border p-3 text-left transition duration-100 active:scale-[0.98] ${
        activo
          ? "border-acento-fuerte bg-tarjeta-suave"
          : "border-borde bg-tarjeta hover:bg-tarjeta-suave"
      }`}
    >
      <span className="block text-sm font-semibold text-tinta">{titulo}</span>
      <span className="mt-0.5 block text-xs text-tinta-suave">{detalle}</span>
    </button>
  );
}
