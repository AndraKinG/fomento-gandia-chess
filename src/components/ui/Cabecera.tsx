export function Cabecera({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="bg-degradado-club px-4 pb-5 pt-6 text-sobre-acento">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <span aria-hidden className="text-2xl">♞</span>
        <div>
          <h1 className="text-xl font-bold leading-tight">{titulo}</h1>
          {subtitulo && <p className="text-sm opacity-90">{subtitulo}</p>}
        </div>
      </div>
    </header>
  );
}
