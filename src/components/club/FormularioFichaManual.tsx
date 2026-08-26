"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearFichaManual } from "@/app/club/(vinculado)/admin/orden-fuerza/actions";

/**
 * Crear a mano la ficha de un socio que acaba de entrar al club.
 *
 * PARA QUÉ, y por qué es un respaldo y no el camino normal: quien entra se autofedera y
 * en unas semanas la FACV lo publica en su orden de fuerza, y la sincronización del
 * fin de semana lo trae solo. Esto es para ese hueco de semanas — **sin ficha no puede vincular
 * su cuenta**, porque la lista de `/club/vincular` sale del orden de fuerza, así que
 * hasta entonces no tendría acceso a la app.
 *
 * VIVE EN `components` porque lo usan DOS pantallas: la de admin (junto a los
 * importadores) y `/club/solicitudes`, que es la de la junta — y la junta no entra en
 * `/club/admin`. Antes solo estaba en la de admin, así que dar de alta a un socio
 * dependía de que el propietario tuviera un rato.
 *
 * CUANDO LA FACV LO PUBLIQUE, LAS DOS FICHAS SE FUNDEN SOLAS: el importador cruza por
 * palabras del nombre además de por ID FIDE, justo para no acabar con dos fichas de la
 * misma persona (una con su cuenta y sus partidas, otra en el orden de fuerza).
 */
export function FormularioFichaManual({ volverA }: { volverA: string }) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd: FormData) => {
        setAviso(null);
        startTransition(async () => {
          const r = await crearFichaManual(fd);
          if (r.error) {
            setAviso({ ok: false, texto: r.error });
            return;
          }
          setAviso({ ok: true, texto: r.ok ?? "Ficha creada." });
          router.refresh();
        });
      }}
      className="flex flex-col gap-3"
    >
      <input
        name="nombre"
        required
        placeholder="Nombre y apellidos"
        className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="elo_fide" type="number" min={0} max={3500} placeholder="ELO FIDE"
          className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
        <input name="elo_feda" type="number" min={0} max={3500} placeholder="ELO FEDA"
          className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
        <input name="elo_otro" type="number" min={0} max={3500} placeholder="ELO estimado"
          className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="fide_id" placeholder="ID FIDE (si lo tiene)"
          className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
        <input name="feda_id" placeholder="ID FEDA (si lo tiene)"
          className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
      </div>
      {/* AL ORDEN DE FUERZA SOLO SI TOCA, y por defecto NO. Ese documento lo publica
          la FACV al empezar la temporada y decide en qué tablero juega cada uno: quien
          entra al club con el plazo abierto sí va dentro, con su número "bis"; quien
          llega después, no — meterlo sería reescribir un papel con el que ya se han hecho
          convocatorias. Su ficha existe igual y sale en los socios del club. */}
      <label className="flex items-start gap-2 text-sm text-tinta">
        <input
          type="checkbox"
          name="al_orden"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-borde"
        />
        <span>
          Meterlo también en el orden de fuerza del Interclubs
          <span className="block text-xs text-tinta-suave">
            Solo si el plazo sigue abierto y va a poder jugar esta temporada. Si ya se
            cerró, déjalo sin marcar: la sincronización lo colocará cuando la FACV lo
            publique.
          </span>
        </span>
      </label>
      <p className="text-xs text-tinta-suave">
        Los ELO son opcionales. Sin ninguno se le asigna 1400 (RGC 52.1) y queda al final
        del orden.
      </p>
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-xl bg-acento-fuerte px-4 py-2.5 text-sm font-semibold text-sobre-acento disabled:opacity-50"
      >
        {pendiente ? "Creando la ficha…" : "Crear ficha y colocarla en el orden"}
      </button>
      {aviso && (
        <p
          className={`text-sm ${
            aviso.ok ? "text-tinta" : "text-red-600 dark:text-red-400"
          }`}
        >
          {aviso.texto}
          {aviso.ok && (
            <>
              {" "}
              <a href={volverA} className="text-acento-texto underline">
                Ver la lista
              </a>
            </>
          )}
        </p>
      )}
    </form>
  );
}
