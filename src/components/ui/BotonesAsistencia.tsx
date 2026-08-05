"use client";

type Valor = "voy" | "no_voy" | "duda" | null;

const OPCIONES: { valor: Exclude<Valor, null>; icono: string; texto: string }[] = [
  { valor: "voy", icono: "✅", texto: "Voy" },
  { valor: "no_voy", icono: "❌", texto: "No voy" },
  { valor: "duda", icono: "🤔", texto: "Duda" },
];

/**
 * Botones de "¿vas a este torneo?".
 *
 * Gemelo visual de `BotonesDisponibilidad`, con el que comparte estilos y
 * comportamiento, pero con su propio vocabulario: en Interclubs se pregunta si
 * "puedes jugar" una jornada y aquí si "vas" a un torneo, y son valores
 * distintos en base de datos (`voy`/`no_voy`/`duda` frente a
 * `disponible`/`no_disponible`/`duda`). Se mantienen separados a propósito para
 * no acabar con un componente genérico parametrizado que nadie entienda; si
 * apareciera un tercer caso, entonces sí tocaría unificarlos.
 */
export function BotonesAsistencia({
  valor,
  onCambio,
  deshabilitado = false,
}: {
  valor: Valor;
  onCambio: (v: Exclude<Valor, null>) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="¿Vas al torneo?">
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          disabled={deshabilitado}
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={`flex-1 rounded-xl border px-2 py-2 text-sm transition duration-100 active:scale-[0.97] ${
            valor === o.valor
              ? "border-acento-fuerte bg-acento-fuerte text-sobre-acento hover:brightness-110"
              : "border-borde bg-tarjeta text-tinta hover:bg-tarjeta-suave"
          } disabled:opacity-50`}
        >
          <span aria-hidden>{o.icono}</span> {o.texto}
        </button>
      ))}
    </div>
  );
}
