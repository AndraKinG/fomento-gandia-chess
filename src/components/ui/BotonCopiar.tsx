"use client";

import { useEffect, useState } from "react";
import { Boton } from "./Boton";

/**
 * Copia un texto al portapapeles y lo dice.
 *
 * DOS CAMINOS A PROPÓSITO: `navigator.clipboard` solo existe en contexto seguro y
 * además puede rechazar por permisos, y un botón de copiar que no hace nada y no
 * avisa es peor que no tenerlo. Por eso hay respaldo con un textarea temporal y
 * `execCommand`, que está obsoleto pero funciona en todas partes, y un tercer
 * estado visible para cuando fallan los dos.
 */
export function BotonCopiar({
  texto,
  etiqueta = "Copiar",
  className = "",
}: {
  texto: string;
  etiqueta?: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "error">("listo");

  // El aviso vuelve a su sitio solo. Sin esto se queda un "Copiado" fijo que ya
  // no corresponde a nada.
  useEffect(() => {
    if (estado === "listo") return;
    const t = setTimeout(() => setEstado("listo"), 2000);
    return () => clearTimeout(t);
  }, [estado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
      return;
    } catch {
      // Sigue al respaldo.
    }
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      setEstado(ok ? "copiado" : "error");
    } catch {
      setEstado("error");
    }
  }

  return (
    <Boton
      variante="secundario"
      onClick={copiar}
      className={`px-3 py-1.5 text-sm ${className}`}
    >
      {estado === "copiado"
        ? "Copiado ✓"
        : estado === "error"
          ? "No se ha podido"
          : etiqueta}
    </Boton>
  );
}
