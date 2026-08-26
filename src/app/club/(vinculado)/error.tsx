"use client";

import { Contenedor } from "@/components/ui/Contenedor";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

/**
 * Una pantalla de la zona de socios que ha fallado.
 *
 * VA AQUÍ Y NO SOLO EN `global-error` a propósito: este se pinta DENTRO del layout del
 * club, así que la barra de navegación de abajo sigue ahí y el socio puede irse a otra
 * sección con un toque. `global-error` sustituye el documento entero —hasta la
 * navegación— y solo debería verse si lo que se rompe es el propio layout.
 *
 * `reset()` reintenta sin recargar. Lo que falla aquí suele ser una lectura a Supabase
 * que ha ido mal una vez, y eso se arregla insistiendo.
 *
 * SIN EL MENSAJE DEL ERROR: no le dice nada al socio y puede llevar dentro el nombre de
 * una tabla. El `digest` sí, que es lo que permite buscarlo en los registros de Vercel.
 */
export default function ErrorDelClub({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Contenedor medida="lectura">
        <EstadoVacio
          titulo="Esta pantalla no ha cargado"
          detalle="No es cosa tuya. Vuelve a intentarlo, o entra en otra sección desde abajo."
        />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-acento-fuerte px-4 py-2 text-sm font-semibold text-sobre-acento"
          >
            Volver a intentarlo
          </button>
        </div>
        {error.digest && (
          <p className="mt-6 text-center text-[11px] text-tinta-suave">
            Referencia: {error.digest}
          </p>
        )}
      </Contenedor>
    </main>
  );
}
