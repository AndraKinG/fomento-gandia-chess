import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Escudo } from "@/components/ui/Escudo";
import { Revelar } from "@/components/inicio/Revelar";
import { Parallax } from "@/components/inicio/Parallax";
import { TableroMiniatura } from "@/components/inicio/TableroMiniatura";

/**
 * Web pública del club. Esqueleto: existe para que la zona de socios pueda vivir
 * bajo /club desde ya (mover eso más tarde rompería accesos directos de la PWA y
 * enlaces de notificaciones ya enviadas).
 *
 * Datos públicos verificados:
 *   - dirección del local: HECHO (2026-08-07) — sede oficial del listado de sedes
 *     del Interclubs 2026 de la FACV (listado_sedes.php?id=1428), con su enlace de
 *     Google Maps tal cual lo publica la federación.
 *   - descripción del club: del blog oficial (ajedrezgandia.blogspot.com).
 * PENDIENTE DE DATOS DEL PROPIETARIO (está esperando confirmación del club):
 *   - días y horas de juego
 *   - contacto (email o teléfono) — hay candidatos (el de la FACV es de un socio)
 *     pero el propietario quiere confirmar cuál publicar
 *   - una foto del club (el escudo ya está: `public/escudo.png`)
 *   - cuota de socio, si se quiere publicar
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
          {/* La marca (el caballo) y no el mural entero: el mural va grande justo
              debajo de la cabecera, y repetirlo aquí a 128px era enseñarlo dos
              veces, una de ellas ilegible. */}
          <Escudo version="marca" lado={96} priority />
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

      {/* EL LOGO OFICIAL DEL CLUB (2026-08-11): el Puente del Fomento de Gandia
          construido con piezas de ajedrez. Va aquí, grande y en la portada, y NO
          como icono de la PWA: es un cartel con texto y detalle, y a tamaño de
          icono sería una mancha — para eso está el escudo redondo de siempre.
          OJO: el fichero vive en /logo-club.jpg, NUNCA bajo /club/... — ese
          prefijo es la zona de socios y el proxy manda la petición al login
          (pasó: el optimizador de imágenes recibía el HTML del login). */}
      <section className="mx-auto max-w-3xl px-6 pt-12">
        {/* El marco recorta, así que el parallax de dentro no deja franjas. La imagen
            sigue siendo `priority`: es lo primero grande que se ve y no puede esperar
            a que cargue una animación. */}
        <Parallax className="rounded-2xl border border-borde shadow-sm" recorrido={36}>
          <Image
            src="/logo-club.jpg"
            alt="Logo del Club de Ajedrez Fomento Gandia: el Puente del Fomento construido con piezas de ajedrez"
            width={1128}
            height={712}
            className="w-full"
            priority
          />
        </Parallax>
      </section>

      <Revelar className="mx-auto max-w-3xl px-6 py-12">
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
      </Revelar>

      {/* EL MOMENTO DE LA PORTADA. Va justo detrás de "competimos todo el año" porque
          es su demostración: acabas de leer que el club juega, y aquí ves ajedrez. */}
      <TableroMiniatura />

      <Revelar className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-2xl font-bold text-tinta">Dónde jugamos</h2>
        <div className="mt-4 rounded-2xl border border-borde bg-tarjeta p-5 shadow-sm">
          <p className="font-semibold text-tinta">
            Poliesportiu Municipal de Gandia (Sala de Aeróbic)
          </p>
          <p className="mt-1 text-sm text-tinta-suave">
            Avinguda dels Esports, 17 · 46701 Gandia (València)
          </p>
          <p className="mt-3 text-sm text-tinta-suave">
            Disponemos de material de juego, relojes de competición y una
            biblioteca con libros y revistas especializadas.
          </p>
          <a
            href="https://maps.app.goo.gl/MY2pZb8xebRW6M5BA"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-xl border border-borde-acento bg-tarjeta-suave px-4 py-2 text-sm font-semibold text-acento-texto transition duration-100 hover:brightness-95 active:scale-[0.97]"
          >
            📍 Cómo llegar (Google Maps)
          </a>
        </div>
      </Revelar>

      <Revelar id="unirse" className="mx-auto max-w-3xl px-6 pb-16">
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
      </Revelar>

      <footer className="border-t border-borde px-6 py-8">
        <p className="mx-auto max-w-3xl text-sm text-tinta-suave">
          Fomento de Gandia · Club de ajedrez
        </p>
      </footer>
    </main>
  );
}
