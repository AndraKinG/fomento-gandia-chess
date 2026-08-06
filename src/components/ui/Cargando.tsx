import { ANCHOS, Contenedor, type Medida } from "@/components/ui/Contenedor";

/**
 * Esqueleto de pantalla mientras el servidor prepara los datos.
 *
 * POR QUÉ EXISTE: todas las pantallas de `/club` consultan a Supabase, así que
 * son dinámicas: al pulsar una pestaña el navegador se queda en la pantalla
 * anterior hasta que llega la respuesta entera. Con conexión de móvil eso son
 * varias décimas en las que la app parece que no ha registrado el toque.
 *
 * Un `loading.tsx` que use esto cambia dos cosas:
 *
 * 1. La navegación responde al instante: la cabecera y el hueco de las tarjetas
 *    aparecen ya, y el contenido entra cuando esté.
 * 2. Next puede **precargar** la ruta al pasar por encima del enlace, porque ya
 *    hay algo que precargar. Sin `loading.tsx` no prefetchea nada de una ruta
 *    dinámica.
 *
 * No es una barra de progreso: son bloques con la forma de lo que va a venir, que
 * es lo que evita el salto de layout cuando llega de verdad.
 */
export function Cargando({
  medida = "lectura",
  filas = 3,
}: {
  medida?: Medida;
  /** Cuántos bloques de tarjeta insinuar. */
  filas?: number;
}) {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      {/* Misma franja azul y mismo alto que `Cabecera`, para que al llegar el
          contenido el título caiga donde ya estaba el hueco. */}
      <div className="bg-degradado-club px-4 pb-5 pt-6 sm:px-6">
        <div className={`mx-auto flex w-full ${ANCHOS[medida]} items-center gap-3`}>
          <div className="h-7 w-7 animate-pulse rounded bg-white/25" />
          <div className="space-y-1.5">
            <div className="h-5 w-40 animate-pulse rounded bg-white/25" />
            <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
          </div>
        </div>
      </div>
      <Contenedor medida={medida} className="space-y-3">
        {Array.from({ length: filas }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-borde bg-tarjeta"
          />
        ))}
      </Contenedor>
      <span className="sr-only" role="status">
        Cargando…
      </span>
    </main>
  );
}
