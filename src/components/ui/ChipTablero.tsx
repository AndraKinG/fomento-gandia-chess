/**
 * Chip del número de tablero y su color.
 *
 * `compacto` para las tablas: en el acta oficial el chip largo ("Tablero 1 · ♟ Negras")
 * se comía 140 px de cada fila, con la columna del número repitiendo la palabra
 * "Tablero" ocho veces seguidas. En una tabla con cabecera, el número y la pieza ya
 * dicen todo.
 */
export function ChipTablero({
  tablero,
  color,
  compacto = false,
}: {
  tablero: number;
  color: "blancas" | "negras";
  compacto?: boolean;
}) {
  const pieza = color === "blancas" ? "♙" : "♟";
  return (
    <span
      title={`Tablero ${tablero}, ${color}`}
      className="inline-flex items-center gap-1 rounded-full bg-acento-fuerte px-2.5 py-0.5 text-xs font-semibold text-sobre-acento"
    >
      {compacto ? (
        <>
          {tablero} <span aria-hidden>{pieza}</span>
          <span className="sr-only">{color}</span>
        </>
      ) : (
        <>
          Tablero {tablero} · <span aria-hidden>{pieza}</span>{" "}
          {color === "blancas" ? "Blancas" : "Negras"}
        </>
      )}
    </span>
  );
}
