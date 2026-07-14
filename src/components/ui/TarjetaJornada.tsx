import { Tarjeta } from "./Tarjeta";

export function TarjetaJornada({
  equipo, rival, fechaTexto, esLocal, sede, extra,
}: {
  equipo: string; rival: string; fechaTexto: string; esLocal: boolean;
  sede?: string; extra?: React.ReactNode;
}) {
  return (
    <Tarjeta destacada>
      <p className="text-[11px] font-bold uppercase tracking-wide text-acento-texto">
        Próxima jornada · {equipo}
      </p>
      <p className="mt-1 text-lg font-bold text-tinta">vs. {rival}</p>
      <p className="text-sm text-tinta-suave">
        {fechaTexto} · {esLocal ? "En casa" : "Fuera"}{sede ? ` · ${sede}` : ""}
      </p>
      {extra && <div className="mt-3 flex flex-wrap gap-2">{extra}</div>}
    </Tarjeta>
  );
}
