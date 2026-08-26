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
  // Dónde se organiza. Es la primera decisión y condiciona el resto del formulario.
  const [donde, setDonde] = useState<"app" | "chesspairings">("app");
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
              organizadoEn: donde,
              urlPublica: String(fd.get("urlPublica") ?? ""),
            });
            if (r.error) {
              setError(r.error);
              return;
            }
            router.push(`/club/jugar/torneos/${r.id}`);
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

        {/* DÓNDE SE ORGANIZA, Y ES LA PRIMERA DECISIÓN porque cambia todo lo demás
            (propietario, 2026-08-26): un torneo de la app se juega aquí, con reloj y
            chat, y lo emparejamos nosotros; uno de ChessPairings es presencial, lo
            empareja su motor oficial de la FIDE y aquí solo se ve. Un torneo es de uno
            o del otro y se decide ahora: con las dos puertas abiertas habría dos
            clasificaciones y nadie sabría cuál vale. */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tinta">¿Dónde se juega?</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Opcion
              activo={donde === "app"}
              onClick={() => setDonde("app")}
              titulo="En la app"
              detalle="Rápido y entre unos cuantos. Se juega aquí con reloj y chat, y cuenta para el ELO del club."
            />
            <Opcion
              activo={donde === "chesspairings"}
              onClick={() => setDonde("chesspairings")}
              titulo="Presencial (ChessPairings)"
              detalle="El social del club, en tablero. Empareja su motor de la FIDE y aquí se ve la clasificación."
            />
          </div>
          {donde === "chesspairings" && (
            <div className="flex flex-col gap-1 rounded-xl border border-borde bg-tarjeta-suave p-3">
              <label htmlFor="urlPublica" className="text-sm font-medium text-tinta">
                Enlace público del torneo en ChessPairings
              </label>
              <input
                id="urlPublica"
                name="urlPublica"
                type="url"
                placeholder="https://my.chesspairings.org/pubblico/torneo.php?id=…"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
              />
              <p className="text-xs text-tinta-suave">
                Se puede dejar en blanco y pegarlo después, cuando lo hayas creado allí.
                Aquí los socios se apuntan y les llegan los avisos; los emparejamientos y
                la clasificación se llevan allí.
              </p>
            </div>
          )}
        </div>

        {donde === "app" && (
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
              ? "Las rondas se calculan según los inscritos, y se puede parar cuando quieras. Con pocos jugadores acaba repitiendo enfrentamientos: por debajo de 8, mejor liguilla."
              : "El calendario sale entero al generar la primera ronda: N−1 rondas con N jugadores, y nadie repite rival."}
          </p>
        </div>
        )}
        {/* El sistema viaja igual en los de fuera: allí también es suizo o liguilla, y
            saberlo aquí sirve para la tarjeta de la lista. */}
        {donde === "chesspairings" && (
          <input type="hidden" name="sistema" value={sistema} />
        )}

        {/* EL RITMO ES DEL RELOJ DE LA APP, así que en un torneo presencial no pinta
            nada: allí el ritmo lo pone el árbitro en sus bases. */}
        {donde === "app" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-tinta">Ritmo de juego</span>
            <ElegirCadencia valor={cadencia} onCambiar={setCadencia} />
            <p className="text-xs text-tinta-suave">
              Todas las partidas del torneo se juegan a este ritmo.
            </p>
          </div>
        )}

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
