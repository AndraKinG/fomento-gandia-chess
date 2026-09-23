"use client";

import { useState } from "react";

/**
 * Compartir esta pantalla por WhatsApp (o por donde sea).
 *
 * POR QUÉ HACÍA FALTA, y no es un adorno: hasta ahora la única forma de decirle a otro
 * socio "vamos a este torneo" era escribirle el mensaje a mano en el grupo, con la fecha
 * y el sitio copiados de la pantalla. Es lo que pidió el propietario antes de abrir la
 * app al club: que compartir un torneo sea un botón.
 *
 * EL ENLACE VA DENTRO DEL TEXTO Y NO EN EL CAMPO `url` DE `navigator.share`. La API
 * admite `{title, text, url}`, pero cada aplicación decide qué hace con los tres: unas
 * los juntan, otras se quedan solo con `url` y tiran el texto, y otras pegan el enlace
 * dos veces. Metiéndolo en `text` el mensaje sale igual en todas, que es lo que importa
 * cuando el destino habitual es un grupo de WhatsApp. `title` se pasa igualmente porque
 * algunos destinos lo usan de asunto, y ninguno lo duplica en el cuerpo.
 *
 * SIN `navigator.share` SE COPIA AL PORTAPAPELES: en escritorio esa API casi no existe
 * (Firefox no la trae, y Chrome solo en algunos sistemas), así que el botón no puede
 * depender de ella. El texto es el mismo, y quien lo pega en WhatsApp Web obtiene lo
 * mismo que quien comparte desde el móvil.
 *
 * NO SE DICE "ERROR" SI SE CANCELA: al cerrar la hoja de compartir, el navegador
 * rechaza la promesa con `AbortError`. Es el gesto normal de arrepentirse, no un fallo,
 * y enseñar un error rojo por cerrar un panel es lo que hace que la gente no vuelva a
 * tocar el botón.
 *
 * EL MENSAJE LO COMPONE `src/lib/compartir/mensaje.ts`, que es puro y tiene tests: aquí
 * solo se pinta y se llama a la API del navegador.
 */
export function BotonCompartir({
  texto,
  titulo,
  etiqueta = "Compartir",
  className = "",
}: {
  /** El mensaje entero, enlace incluido. Sale de `src/lib/compartir/mensaje.ts`. */
  texto: string;
  /** Asunto para los destinos que lo usan (correo, sobre todo). */
  titulo: string;
  etiqueta?: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<"quieto" | "copiado" | "falla">("quieto");

  async function compartir() {
    setEstado("quieto");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto });
        return;
      } catch (e) {
        // Cancelar no es fallar: se sale sin decir nada.
        if (e instanceof Error && e.name === "AbortError") return;
        // Cualquier otra cosa cae al portapapeles, que es mejor que no hacer nada.
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
      setTimeout(() => setEstado("quieto"), 2500);
    } catch {
      setEstado("falla");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={compartir}
        className="inline-flex items-center gap-1.5 rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-sm font-medium text-tinta transition duration-100 hover:bg-tarjeta-suave active:scale-[0.97]"
      >
        <span aria-hidden>📤</span>
        {estado === "copiado" ? "Copiado" : etiqueta}
      </button>
      {/* `aria-live` para que un lector de pantalla cante el cambio: el botón dice
          "Copiado" cambiando su propio texto, y eso solo no se anuncia. */}
      <p aria-live="polite" className="sr-only">
        {estado === "copiado" ? "Mensaje copiado al portapapeles" : ""}
      </p>
      {estado === "falla" && (
        <p className="mt-1 text-xs text-tinta-suave">
          No se ha podido copiar. Copia la dirección de la barra del navegador.
        </p>
      )}
    </div>
  );
}
