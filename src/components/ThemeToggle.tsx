"use client";

import { useSyncExternalStore } from "react";

type Tema = "sistema" | "claro" | "oscuro";
const ORDEN: Tema[] = ["sistema", "claro", "oscuro"];
const ETIQUETA: Record<Tema, string> = {
  sistema: "🌗 Tema: sistema",
  claro: "☀️ Tema: claro",
  oscuro: "🌙 Tema: oscuro",
};
const EVENTO_TEMA = "tema-cambiado";

function aplicar(tema: Tema) {
  const oscuroSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const oscuro = tema === "oscuro" || (tema === "sistema" && oscuroSistema);
  document.documentElement.classList.toggle("dark", oscuro);
}

// El tema vive en `localStorage` (estado externo a React), así que se lee con
// `useSyncExternalStore`: el servidor no tiene `localStorage` y siempre
// "ve" el snapshot `leerTemaServidor` ("sistema"); tras hidratar, React vuelve
// a pedir el snapshot real (`leerTema`) y re-renderiza si difiere. A
// diferencia de un `useState` con inicializador perezoso + `suppressHydrationWarning`,
// esto sí actualiza el DOM de forma fiable (sin dejar el botón "congelado"
// mostrando "sistema" para siempre tras recargar con un tema guardado), y sin
// llamar a `setState` dentro de un efecto.
function leerTema(): Tema {
  return (localStorage.getItem("tema") as Tema | null) ?? "sistema";
}

function leerTemaServidor(): Tema {
  return "sistema";
}

function suscribir(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENTO_TEMA, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENTO_TEMA, cb);
  };
}

export function ThemeToggle() {
  const tema = useSyncExternalStore(suscribir, leerTema, leerTemaServidor);
  function ciclar() {
    const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
    localStorage.setItem("tema", siguiente);
    aplicar(siguiente);
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }
  return (
    <button onClick={ciclar}
      className="rounded-xl border border-borde bg-tarjeta px-4 py-2 text-sm text-tinta">
      {ETIQUETA[tema]}
    </button>
  );
}
