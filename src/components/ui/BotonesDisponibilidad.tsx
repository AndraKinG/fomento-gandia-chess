"use client";

type Valor = "disponible" | "no_disponible" | "duda" | null;
const OPCIONES: { valor: Exclude<Valor, null>; icono: string; texto: string }[] = [
  { valor: "disponible", icono: "✅", texto: "Puedo" },
  { valor: "no_disponible", icono: "❌", texto: "No puedo" },
  { valor: "duda", icono: "🤔", texto: "Duda" },
];

export function BotonesDisponibilidad({
  valor, onCambio, deshabilitado = false,
}: { valor: Valor; onCambio: (v: Exclude<Valor, null>) => void; deshabilitado?: boolean }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Disponibilidad">
      {OPCIONES.map((o) => (
        <button key={o.valor} type="button" disabled={deshabilitado}
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={`flex-1 rounded-xl border px-2 py-2 text-sm transition ${
            valor === o.valor
              ? "border-acento bg-acento text-sobre-acento"
              : "border-borde bg-tarjeta text-tinta"
          } disabled:opacity-50`}>
          <span aria-hidden>{o.icono}</span> {o.texto}
        </button>
      ))}
    </div>
  );
}
