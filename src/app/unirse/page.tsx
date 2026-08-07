import type { Metadata } from "next";
import Link from "next/link";
import { FormularioIngreso } from "./FormularioIngreso";

export const metadata: Metadata = {
  title: "Unirse al club · Fomento de Gandia",
  description:
    "Solicita entrar en el club de ajedrez Fomento de Gandia. No hace falta nivel previo.",
  robots: { index: true, follow: true },
};

export default function UnirsePage() {
  return (
    <main className="flex-1 bg-fondo">
      <header className="bg-degradado-club px-6 py-12 text-sobre-acento">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="text-sm underline opacity-90">
            ← Fomento de Gandia
          </Link>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Quiero unirme</h1>
          <p className="mt-2 opacity-90">
            Déjanos tus datos y te contamos cómo va.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-2xl border border-borde bg-tarjeta p-6 shadow-sm">
          <FormularioIngreso />
        </div>

        <div className="mt-6 rounded-2xl border border-borde bg-tarjeta-suave p-5">
          <h2 className="font-semibold text-tinta">¿Qué pasa después?</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-tinta-suave">
            <li>Recibimos tu solicitud y la revisa la junta del club.</li>
            <li>Te escribimos al email para conocerte y resolver dudas.</li>
            <li>Hablamos de la cuota de socio y de cuándo puedes venir a jugar.</li>
          </ol>
          <p className="mt-3 text-sm text-tinta-suave">
            Si ya eres socio y lo que quieres es entrar en la app,{" "}
            <Link href="/registro" className="font-semibold text-acento-texto underline">
              crea tu cuenta con el código del club
            </Link>
            .
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-borde bg-tarjeta p-5 shadow-sm">
          <h2 className="font-semibold text-tinta">Dónde estamos</h2>
          <p className="mt-2 text-sm text-tinta-suave">
            Poliesportiu Municipal de Gandia (Sala de Aeróbic) · Avinguda dels
            Esports, 17 · 46701 Gandia (València)
          </p>
          <a
            href="https://maps.app.goo.gl/MY2pZb8xebRW6M5BA"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex rounded-xl border border-borde-acento bg-tarjeta-suave px-4 py-2 text-sm font-semibold text-acento-texto transition duration-100 hover:brightness-95 active:scale-[0.97]"
          >
            📍 Cómo llegar (Google Maps)
          </a>
        </div>
      </section>
    </main>
  );
}
