import type { Metadata } from "next";
import Link from "next/link";
import { Escudo } from "@/components/ui/Escudo";

/**
 * Web pública del club. Esqueleto: existe para que la zona de socios pueda vivir
 * bajo /club desde ya (mover eso más tarde rompería accesos directos de la PWA y
 * enlaces de notificaciones ya enviadas).
 *
 * PENDIENTE DE DATOS DEL PROPIETARIO. Aquí solo hay hechos verificables desde el
 * propio proyecto (nombre, ciudad, equipos y categorías reales de la temporada).
 * Falta rellenar, y NO se ha inventado nada:
 *   - dirección del local y cómo llegar
 *   - días y horas de juego
 *   - contacto (email o teléfono) para quien quiera venir a probar
 *   - una foto del club (el escudo ya está: `public/escudo.png`)
 *   - cuota de socio, si se quiere publicar
 * El formulario de solicitud de ingreso llegará con el modelo de rangos, que
 * necesita el rol "junta" para validar las peticiones.
 */

export const metadata: Metadata = {
  title: "Fomento de Gandia · Club de ajedrez",
  description:
    "Club de ajedrez Fomento de Gandia: tres equipos en los Interclubs de la Federación de Ajedrez de la Comunitat Valenciana.",
  // La web pública sí quiere aparecer en buscadores, al contrario que /club.
  robots: { index: true, follow: true },
};

const EQUIPOS = [
  { nombre: "Equipo A", categoria: "1ª Autonómica Sur" },
  { nombre: "Equipo B", categoria: "1ª Provincial Valencia Sur" },
  { nombre: "Equipo C", categoria: "2ª Provincial Valencia Sur" },
];

export default function PaginaPublica() {
  return (
    <main className="flex-1 bg-fondo">
      <header className="bg-degradado-club px-6 py-16 text-sobre-acento">
        <div className="mx-auto max-w-3xl">
          {/* Escudo completo y grande: esta es la carta de presentación del club y
              es el único sitio donde el aro con el nombre se lee de verdad. */}
          <Escudo version="completo" lado={128} priority />
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Fomento de Gandia</h1>
          <p className="mt-3 text-lg opacity-90">Club de ajedrez · Gandia</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-sobre-acento px-5 py-3 font-semibold text-acento-fuerte transition duration-100 hover:brightness-95 active:scale-[0.97]"
            >
              Entrar (socios)
            </Link>
            <Link
              href="/unirse"
              className="rounded-xl border border-sobre-acento/40 px-5 py-3 font-semibold text-sobre-acento transition duration-100 hover:bg-white/10 active:scale-[0.97]"
            >
              Quiero jugar
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-2xl font-bold text-tinta">Competimos todo el año</h2>
        <p className="mt-3 text-tinta-suave">
          Jugamos los Interclubs de la Federación de Ajedrez de la Comunitat
          Valenciana con tres equipos, y participamos en torneos por toda la
          provincia.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {EQUIPOS.map((e) => (
            <li
              key={e.nombre}
              className="rounded-2xl border border-borde bg-tarjeta p-4 shadow-sm"
            >
              <p className="font-semibold text-tinta">{e.nombre}</p>
              <p className="mt-1 text-sm text-tinta-suave">{e.categoria}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="unirse" className="mx-auto max-w-3xl px-6 pb-16">
        <div className="rounded-2xl border border-borde-acento bg-tarjeta-suave p-6">
          <h2 className="text-2xl font-bold text-tinta">¿Quieres unirte?</h2>
          <p className="mt-3 text-tinta-suave">
            Da igual tu nivel: hay sitio tanto si compites como si solo quieres
            jugar. Déjanos tus datos y te contamos cómo va.
          </p>
          <div className="mt-4">
            <Link
              href="/unirse"
              className="inline-flex rounded-xl bg-acento-fuerte px-5 py-3 font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]"
            >
              Solicitar entrar en el club
            </Link>
          </div>
          <p className="mt-4 text-sm text-tinta-suave">
            Si ya eres socio y tienes el código del club,{" "}
            <Link href="/registro" className="font-semibold text-acento-texto underline">
              crea tu cuenta aquí
            </Link>
            .
          </p>
        </div>
      </section>

      <footer className="border-t border-borde px-6 py-8">
        <p className="mx-auto max-w-3xl text-sm text-tinta-suave">
          Fomento de Gandia · Club de ajedrez
        </p>
      </footer>
    </main>
  );
}
