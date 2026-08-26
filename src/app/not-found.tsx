import Link from "next/link";
import { Contenedor } from "@/components/ui/Contenedor";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

/**
 * La pantalla de una dirección que no existe.
 *
 * POR QUÉ HACÍA FALTA: no había ninguna, así que un enlace viejo o una dirección mal
 * escrita caía en el 404 de fábrica de Next —fondo blanco, texto en inglés, y **ninguna
 * forma de volver**—. En un móvil, sin barra de direcciones a mano, eso es un callejón
 * sin salida: la única salida es cerrar la app.
 *
 * SE OFRECEN LOS DOS SITIOS y no solo uno, porque desde aquí no se sabe quién ha
 * llegado: un socio con sesión quiere volver a la zona del club, y un visitante a la
 * web pública. Un enlace que no es el que querías es mejor que ninguno.
 *
 * Las pantallas de detalle NO dependen de esto: cuando el registro no existe
 * (`/club/socios/<id-inventado>`) redirigen a su lista, que es más útil que un 404.
 * Esto cubre lo otro: la ruta que no existe en absoluto.
 */
export default function NoEncontrado() {
  return (
    <main className="flex min-h-dvh items-center bg-fondo">
      <Contenedor medida="lectura">
        <EstadoVacio
          icono="🧭"
          titulo="Esta página no existe"
          detalle="El enlace puede estar mal escrito, o llevaba a algo que ya se ha quitado."
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href="/club"
            className="rounded-xl bg-acento-fuerte px-4 py-2 text-sm font-semibold text-sobre-acento"
          >
            Ir al club
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-borde px-4 py-2 text-sm text-tinta hover:bg-tarjeta-suave"
          >
            Portada
          </Link>
        </div>
      </Contenedor>
    </main>
  );
}
