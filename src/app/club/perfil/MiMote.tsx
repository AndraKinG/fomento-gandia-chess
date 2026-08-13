"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/Boton";
import { MOTE_MAX, validarMote } from "@/lib/club/mote";
import { solicitarMote } from "./actions";

/**
 * "Cómo quieres que te llamen": el socio pide su mote y la junta lo aprueba.
 *
 * VALIDA ANTES DE MANDAR con el MISMO módulo que usa el servidor (`validarMote`), que
 * es lo que pidió el propietario: así el "el mote va de 2 a 40 letras" sale al momento
 * y no después de un viaje. Pero el servidor lo vuelve a validar igual —esto es
 * comodidad, no seguridad— y la comprobación de que no lo tenga otro solo puede hacerse
 * allí, porque hace falta ver los motes de los demás.
 *
 * TRES ESTADOS QUE SE DISTINGUEN A LA VISTA, porque son tres cosas distintas y
 * confundirlas es lo que haría a alguien pedir dos veces lo mismo: no tienes mote, lo
 * has pedido y está esperando, o ya lo tienes puesto.
 */
export function MiMote({
  apodo,
  apodoSolicitado,
}: {
  apodo: string | null;
  apodoSolicitado: string | null;
}) {
  const [texto, setTexto] = useState(apodoSolicitado ?? apodo ?? "");
  const [aviso, setAviso] = useState<{ malo: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  const cambiado = texto.trim() !== (apodoSolicitado ?? apodo ?? "");

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-tinta">Cómo te llaman en el club</p>
        <p className="text-xs text-tinta-suave">
          {apodoSolicitado ? (
            <>
              Has pedido <b className="font-semibold">{apodoSolicitado}</b>. La junta lo
              tiene que aprobar.
            </>
          ) : apodo ? (
            <>
              Ahora eres <b className="font-semibold">{apodo}</b> en toda la app.
            </>
          ) : (
            "Tu mote sale en los retos, los torneos y las partidas, en lugar del nombre de la federación."
          )}
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        action={() => {
          // La misma regla que el servidor, para no gastar un viaje en un error de
          // formato que se ve desde aquí.
          const revisado = validarMote(texto);
          if (!revisado.ok) {
            setAviso({ malo: true, texto: revisado.error });
            return;
          }
          setAviso(null);
          startTransition(async () => {
            const r = await solicitarMote(texto);
            if (r.error) {
              setAviso({ malo: true, texto: r.error });
              return;
            }
            setAviso({ malo: false, texto: r.ok ?? "Pedido." });
            router.refresh();
          });
        }}
      >
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={MOTE_MAX}
          placeholder="Ximo"
          aria-label="Mote que quieres"
          disabled={pendiente}
          className="min-w-0 flex-1 rounded-xl border border-borde bg-tarjeta px-3 py-2 text-tinta placeholder:text-tinta-suave disabled:opacity-50"
        />
        <Boton variante="secundario" type="submit" disabled={pendiente || !cambiado}>
          {pendiente ? "Enviando…" : apodoSolicitado || apodo ? "Cambiar" : "Pedir"}
        </Boton>
      </form>

      {/* Retirar la solicitud es vaciar el campo y enviar, pero eso no se le ocurre a
          nadie, así que se dice. Solo cuando hay algo que retirar. */}
      {apodoSolicitado && !pendiente && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            startTransition(async () => {
              const r = await solicitarMote("");
              setAviso({ malo: Boolean(r.error), texto: r.error ?? r.ok ?? "" });
              router.refresh();
            });
          }}
          className="text-xs text-tinta-suave underline"
        >
          Retirar la solicitud
        </button>
      )}

      {aviso && (
        <p
          className={`text-xs ${
            aviso.malo ? "text-red-600 dark:text-red-400" : "text-tinta-suave"
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
