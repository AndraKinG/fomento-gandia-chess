"use client";

import { useEffect } from "react";
import { informarError } from "@/lib/errores/informar";

/**
 * Escucha los errores del navegador que NO pasan por una pantalla de error: un fallo
 * dentro de un botón, de un temporizador o de una promesa que nadie esperaba.
 *
 * Los que rompen una pantalla entera los recoge `error.tsx` / `global-error.tsx`, que
 * React ya captura antes de que lleguen aquí.
 *
 * Va en el layout raíz para cubrir también la web pública y el login. No pinta nada.
 */
export function CapturarErrores() {
  useEffect(() => {
    const alFallar = (evento: ErrorEvent) => informarError(evento.error ?? evento.message);
    const alRechazar = (evento: PromiseRejectionEvent) => informarError(evento.reason);
    window.addEventListener("error", alFallar);
    window.addEventListener("unhandledrejection", alRechazar);
    return () => {
      window.removeEventListener("error", alFallar);
      window.removeEventListener("unhandledrejection", alRechazar);
    };
  }, []);
  return null;
}
