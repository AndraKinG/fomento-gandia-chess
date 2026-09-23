import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth/sesion";
import { rangoDe } from "@/lib/asistente/rangos";
import { guiaPara } from "@/lib/guia/guia";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Contenedor, Rejilla } from "@/components/ui/Contenedor";
import { BotonCompartir } from "@/components/club/BotonCompartir";
import { mensajeApp, URL_APP } from "@/lib/compartir/mensaje";

/**
 * "¿Qué puedes hacer aquí?": la guía de la app, recortada al rango de quien mira.
 *
 * EL CONTENIDO NO VIVE AQUÍ: sale de `src/lib/guia/guia.ts`, la MISMA fuente que
 * alimenta el mapa del asistente. Si esta pantalla y el asistente contaran la app
 * cada uno por su lado, acabarían contando cosas distintas — y el recorte por
 * rango tiene que ser el mismo en los dos sitios por la misma razón.
 *
 * Cuelga del perfil y no de la navegación: es una pantalla que se mira una vez
 * al llegar y de tarde en tarde después, no una sección del día a día.
 */
export default async function GuiaPage() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");

  const rango = rangoDe({
    esAdmin: sesion.esAdmin,
    esJunta: Boolean(sesion.esJunta),
  });
  const secciones = guiaPara(rango);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Qué puedes hacer aquí"
        subtitulo="La app, sección a sección"
        volverA="/club/perfil"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {/* COMPARTIR LA APP ENTERA, y esta es su pantalla: quien acaba de leer para qué
            sirve es justo quien se la quiere pasar a otro socio. Hace falta para el
            lanzamiento — el mensaje al grupo de WhatsApp se escribía a mano. */}
        <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-tinta">Pásasela a otro socio</p>
            <p className="text-sm text-tinta-suave">
              Con el código del club, cualquiera del Fomento puede entrar.
            </p>
          </div>
          <BotonCompartir
            texto={mensajeApp(URL_APP)}
            titulo="La app del Fomento de Gandia"
            etiqueta="Compartir la app"
          />
        </Tarjeta>

        <Rejilla columnas={2}>
          {secciones.map((s) => (
            <Tarjeta key={s.clave} className="space-y-2">
              <p className="flex items-center gap-2 font-semibold text-tinta">
                <span aria-hidden>{s.icono}</span> {s.titulo}
              </p>
              <p className="text-sm text-tinta-suave">{s.que}</p>
              <ul className="space-y-1 text-sm text-tinta">
                {s.puntos.map((punto, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-acento-texto">
                      ·
                    </span>
                    <span>{punto}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ))}
        </Rejilla>
        <p className="px-1 text-xs text-tinta-suave">
          Para el detalle de cualquier pantalla, pregúntale al asistente (el botón
          de abajo a la derecha): sabe esta misma guía y consulta los datos reales.
        </p>
      </Contenedor>
    </main>
  );
}
