export function ChipTablero({
  tablero, color,
}: { tablero: number; color: "blancas" | "negras" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-acento-fuerte px-2.5 py-0.5 text-xs font-semibold text-sobre-acento">
      Tablero {tablero} · {color === "blancas" ? "♙ Blancas" : "♟ Negras"}
    </span>
  );
}
