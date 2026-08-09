"use client";

import { useSyncExternalStore } from "react";

/**
 * Elegir tema: claro u oscuro, y nada más.
 *
 * SE QUITÓ "SISTEMA" por decisión del propietario. Como opción tenía un problema:
 * quien la llevaba puesta veía cambiar la app sola al anochecer sin haber tocado
 * nada, y eso desconcierta más de lo que ayuda en una app de club. Ahora la
 * preferencia del sistema decide cuál se usa la PRIMERA vez, que es donde de verdad
 * aporta, y a partir de ahí manda lo que elija el socio.
 *
 * DOS BOTONES Y NO UNO QUE CICLA: con tres opciones ciclar tenía sentido; con dos,
 * ver las dos y pulsar la que quieres es más directo y dice en qué estado estás sin
 * tener que leer la etiqueta.
 */

type Tema = "claro" | "oscuro";
const EVENTO_TEMA = "tema-cambiado";

function aplicar(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "oscuro");
}

// El tema vive en `localStorage` (estado externo a React), así que se lee con
// `useSyncExternalStore`: el servidor no tiene `localStorage` y siempre "ve" el
// snapshot de servidor; tras hidratar, React vuelve a pedir el real y re-renderiza
// si difiere. Con un `useState` + inicializador perezoso el botón se quedaba
// congelado tras recargar con un tema guardado.
function leerTema(): Tema {
  const guardado = localStorage.getItem("tema");
  if (guardado === "claro" || guardado === "oscuro") return guardado;
  // Sin elección previa manda el sistema, que es la mejor primera impresión. En
  // cuanto se toca un botón, se guarda y ya no cambia solo nunca más.
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

function leerTemaServidor(): Tema {
  return "claro";
}

function suscribir(cb: () => void) {
  const notificar = () => {
    aplicar(leerTema());
    cb();
  };
  // `storage` para cuando se cambia en otra pestaña; el evento propio para el
  // cambio de esta misma.
  window.addEventListener("storage", notificar);
  window.addEventListener(EVENTO_TEMA, notificar);
  return () => {
    window.removeEventListener("storage", notificar);
    window.removeEventListener(EVENTO_TEMA, notificar);
  };
}

export function ThemeToggle() {
  const tema = useSyncExternalStore(suscribir, leerTema, leerTemaServidor);

  function elegir(nuevo: Tema) {
    localStorage.setItem("tema", nuevo);
    aplicar(nuevo);
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }

  return (
    <div
      role="group"
      aria-label="Tema de la aplicación"
      className="inline-flex gap-1 rounded-xl border border-borde bg-tarjeta p-1"
    >
      {(
        [
          { valor: "claro", etiqueta: "Claro", icono: "☀️" },
          { valor: "oscuro", etiqueta: "Oscuro", icono: "🌙" },
        ] as const
      ).map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => elegir(o.valor)}
          aria-pressed={tema === o.valor}
          className={`rounded-lg px-3 py-1.5 text-sm transition duration-100 ${
            tema === o.valor
              ? "bg-acento-fuerte font-semibold text-sobre-acento"
              : "text-tinta hover:bg-tarjeta-suave"
          }`}
        >
          <span aria-hidden>{o.icono}</span> {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
