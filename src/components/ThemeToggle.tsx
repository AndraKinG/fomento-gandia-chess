"use client";

import { useState } from "react";

type Tema = "sistema" | "claro" | "oscuro";
const ORDEN: Tema[] = ["sistema", "claro", "oscuro"];
const ETIQUETA: Record<Tema, string> = {
  sistema: "🌗 Tema: sistema",
  claro: "☀️ Tema: claro",
  oscuro: "🌙 Tema: oscuro",
};

function aplicar(tema: Tema) {
  const oscuroSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const oscuro = tema === "oscuro" || (tema === "sistema" && oscuroSistema);
  document.documentElement.classList.toggle("dark", oscuro);
}

// Inicializador perezoso: lee `localStorage` ya en el primer render del
// cliente (guardado con `typeof window` porque en el render de servidor
// `window` no existe y debe devolver "sistema"). Así se evita el parpadeo
// de la etiqueta "sistema" que aparecía antes de un `useEffect` posterior.
function temaInicial(): Tema {
  if (typeof window === "undefined") return "sistema";
  return (localStorage.getItem("tema") as Tema | null) ?? "sistema";
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(temaInicial);
  function ciclar() {
    const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
    setTema(siguiente);
    localStorage.setItem("tema", siguiente);
    aplicar(siguiente);
  }
  return (
    <button onClick={ciclar}
      className="rounded-xl border border-borde bg-tarjeta px-4 py-2 text-sm text-tinta">
      {/* Servidor siempre renderiza "sistema"; cliente conoce el tema guardado en hydration.
          La divergencia es intencional (localStorage guardado vs. default de servidor). */}
      <span suppressHydrationWarning>{ETIQUETA[tema]}</span>
    </button>
  );
}
