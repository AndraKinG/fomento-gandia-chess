"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui/Boton";
import { Banner } from "@/components/ui/Banner";
import { solicitarIngreso } from "./actions";

export function FormularioIngreso() {
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (enviada) {
    return (
      <Banner tipo="ok">
        <p className="font-semibold">Solicitud enviada.</p>
        <p className="mt-1">
          Te escribiremos al email que nos has dejado para contarte cómo seguir y
          quedar un día en el club.
        </p>
      </Banner>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const r = await solicitarIngreso(formData);
          if (r.error) {
            setError(r.error);
            return;
          }
          setEnviada(true);
        });
      }}
    >
      {error && <Banner tipo="error">{error}</Banner>}

      <Campo id="nombre" etiqueta="Tu nombre" requerido autoComplete="name" />
      <Campo
        id="email"
        etiqueta="Email"
        tipo="email"
        requerido
        autoComplete="email"
        ayuda="Es por donde te contestaremos."
      />
      <Campo
        id="telefono"
        etiqueta="Teléfono (opcional)"
        tipo="tel"
        autoComplete="tel"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="mensaje" className="text-sm font-medium text-tinta">
          ¿Algo que quieras contarnos? (opcional)
        </label>
        <textarea
          id="mensaje"
          name="mensaje"
          rows={4}
          maxLength={1000}
          placeholder="Si has jugado antes, si vienes de otro club, qué días te vendría bien…"
          className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
        />
        <p className="text-xs text-tinta-suave">
          No hace falta tener nivel ni haber jugado nunca en un club.
        </p>
      </div>

      <Boton variante="degradado" type="submit" disabled={pendiente}>
        {pendiente ? "Enviando…" : "Enviar solicitud"}
      </Boton>

      <p className="text-xs text-tinta-suave">
        Usaremos tus datos solo para ponernos en contacto contigo sobre el club.
      </p>
    </form>
  );
}

function Campo({
  id,
  etiqueta,
  tipo = "text",
  requerido = false,
  autoComplete,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  tipo?: "text" | "email" | "tel";
  requerido?: boolean;
  autoComplete?: string;
  ayuda?: string;
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
        autoComplete={autoComplete}
        className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave"
      />
      {ayuda && <p className="text-xs text-tinta-suave">{ayuda}</p>}
    </div>
  );
}
