"use client";

import { useEffect, useState } from "react";

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

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("sistema");
  useEffect(() => {
    const guardado = (localStorage.getItem("tema") as Tema | null) ?? "sistema";
    setTema(guardado);
  }, []);
  function ciclar() {
    const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
    setTema(siguiente);
    localStorage.setItem("tema", siguiente);
    aplicar(siguiente);
  }
  return (
    <button onClick={ciclar}
      className="rounded-xl border border-borde bg-tarjeta px-4 py-2 text-sm text-tinta">
      {ETIQUETA[tema]}
    </button>
  );
}
