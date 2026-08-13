import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Contenedor } from "@/components/ui/Contenedor";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { BotonAccion } from "@/components/ui/BotonAccion";
import { borrarLeidos, marcarLeido, marcarLeidoQuieto, marcarTodosLeidos } from "./actions";

type AvisoVista = {
  id: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  fecha: string;
  sinLeer: boolean;
};

/**
 * Una fila de la bandeja.
 *
 * DOS ACCIONES POR SEPARADO, no una sola pegada a la navegación (así estaba
 * antes): "ir al aviso" e "marcarlo leído quedándose en la bandeja" son cosas
 * distintas, y con ~100 avisos al año por socio (disponibilidad para los 46,
 * dos veces por semana) obligarlo todo por la navegación significaba volver a
 * entrar a la bandeja una vez por cada aviso para vaciarla. Un aviso SIN `url`
 * (la columna es nullable) solo ofrece la segunda: no hay apertura que
 * prometer. Y un aviso YA LEÍDO no ofrece "marcar leído" (no hay nada que
 * marcar) — si trae `url` se deja un enlace normal para poder volver a abrirlo.
 *
 * SIGUEN SIENDO `<form>` DE SERVIDOR, sin JavaScript de cliente para la lógica:
 * cada botón es su propio formulario (dos `<form>` hermanos, nunca uno dentro
 * de otro, que es HTML inválido) con su propia action. El único cliente aquí
 * es la hoja `BotonAccion` (`useFormStatus`), que solo sabe deshabilitarse y
 * cambiar de texto mientras el envío está en marcha.
 *
 * ACCESIBILIDAD (heredado de la ronda de arreglo 1 y ampliado aquí): con dos
 * controles por fila hace falta que cada uno diga QUÉ ES y QUÉ VA A PASAR sin
 * depender de mirar el negrita o el fondo suave del no leído, que un lector de
 * pantalla no distingue. Cada botón lleva su propio `aria-label` (empieza por
 * "Sin leer:"/"Leído:", como antes) y su `aria-describedby` apunta al cuerpo
 * visible del aviso.
 */
function FilaAviso({ aviso }: { aviso: AvisoVista }) {
  // Dos wrappers, uno por action: la action de un `<form>` tiene que devolver
  // `void`/`Promise<void>`, y las dos funciones de `actions.ts` devuelven
  // `{ error? }` para quien quiera comprobarlo por código (no hace falta aquí:
  // sin deshacer, no hay nada que enseñar si falla salvo dejar el aviso como
  // estaba).
  async function irYMarcarLeido() {
    "use server";
    await marcarLeido(aviso.id);
  }
  async function marcarEsteLeidoQuieto() {
    "use server";
    await marcarLeidoQuieto(aviso.id);
  }

  const estado = aviso.sinLeer ? "Sin leer" : "Leído";
  const idCuerpo = `aviso-cuerpo-${aviso.id}`;

  return (
    <div
      className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3 ${
        aviso.sinLeer ? "bg-tarjeta-suave" : ""
      }`}
    >
      {/* El puntito es solo el refuerzo visual del estado: la distinción de
          verdad (para quien no lo ve) va en el `aria-label` de cada botón. */}
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full sm:mt-1.5 ${
          aviso.sinLeer ? "bg-acento-fuerte" : "bg-transparent"
        }`}
      />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span
          className={`block text-sm text-tinta ${aviso.sinLeer ? "font-semibold" : "font-normal"}`}
        >
          {aviso.titulo}
        </span>
        <span id={idCuerpo} className="block text-sm text-tinta-suave">
          {aviso.cuerpo}
        </span>
        <span className="block text-xs text-tinta-suave">{aviso.fecha}</span>
      </span>
      <div className="flex shrink-0 items-center gap-2 pl-4 sm:pl-0 sm:pt-0.5">
        {aviso.url &&
          (aviso.sinLeer ? (
            // Sin leer + con url: abrirlo marca leído por el camino, como siempre.
            //
            // DICE "VER" Y NO "IR" (corrección de un socio, 2026-08-13): en un aviso de
            // torneo, "Ir" se lee como decir que vas — que es literalmente lo que se
            // contesta en la pantalla del torneo ("¿Vas?" / "Voy") — y el botón solo
            // abre la pantalla. Un botón que parece comprometerte a algo es peor que uno
            // aburrido.
            <form action={irYMarcarLeido}>
              <BotonAccion
                variante="secundario"
                trabajando="Abriendo…"
                className="px-3 py-1.5 text-xs font-medium"
                ariaLabel={`${estado}: ${aviso.titulo}. Abre la pantalla relacionada y lo marca como leído.`}
                ariaDescribedby={idCuerpo}
              >
                Ver
              </BotonAccion>
            </form>
          ) : (
            // Ya leído: no hay ninguna escritura que hacer, así que es un
            // enlace normal y no una action — puedes volver a abrirlo cuantas
            // veces quieras sin que esto sea una "acción" con estado pendiente.
            <Link
              href={aviso.url}
              aria-label={`${estado}: ${aviso.titulo}. Abre la pantalla relacionada.`}
              aria-describedby={idCuerpo}
              className="rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-xs font-medium text-tinta transition hover:bg-tarjeta-suave"
            >
              Ver
            </Link>
          ))}
        {aviso.sinLeer && (
          <form action={marcarEsteLeidoQuieto}>
            <BotonAccion
              variante="secundario"
              trabajando="Marcando…"
              className="px-3 py-1.5 text-xs font-medium"
              ariaLabel={`${estado}: ${aviso.titulo}. Lo marca como leído sin salir de la bandeja.`}
              ariaDescribedby={idCuerpo}
            >
              Marcar leído
            </BotonAccion>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Bandeja de avisos del socio.
 *
 * SIGUE SIN FILTROS Y SIN BUSCADOR — eso lo descartó la spec original y sigue
 * descartado. Lo que sí se añadió después (2026-08-10): "marcar todos como
 * leídos" e "ir al aviso" separado de "marcarlo leído". La spec original
 * también descartaba esto apoyándose en un volumen bajo ("un puñado de avisos
 * por semana"); al arreglar un agujero real, los dos avisos de disponibilidad
 * pasaron a guardarse para los 46 socios dos veces por semana (antes solo para
 * quien tenía push activado), unos ~100 avisos al año por socio. Con ese
 * volumen un badge siempre encendido deja de significar nada, y como todos los
 * tipos de aviso llevaban `url`, marcar uno leído sacaba de la bandeja: vaciar
 * 30 avisos pedía entrar 30 veces. Ver `FilaAviso` para las dos acciones
 * separadas por fila.
 *
 * UNA CAJA CON FILAS, no una columna de tarjetas: es el mismo patrón que el
 * calendario de un equipo en `/club/equipos/[id]` (`div` con borde +
 * `ul.divide-y`). Una lista que puede crecer sin techo no se deja correr en
 * tarjetas de dos líneas con hueco de sobra alrededor; una fila por aviso
 * aprovecha el ancho y dos docenas caben sin parecer una pared de recuadros.
 */
export default async function AvisosPage() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");

  const supabase = await createServerSupabase();
  // `profile_id` es el id de la CUENTA (`auth.uid()`, igual que `profiles.id`),
  // no el de la ficha: por eso se filtra por `sesion.userId` y no por
  // `sesion.playerId`. La policy "avisos: leo los mios" (migración 0028) ya
  // limita esto a lo propio (o a todo si eres admin); el `.eq` de aquí es además
  // lo que aprovecha el índice `notifications_bandeja` (profile_id, creado_en desc).
  const { data: filas } = await supabase
    .from("notifications")
    .select("id, titulo, cuerpo, url, creado_en, leido_en")
    .eq("profile_id", sesion.userId)
    .order("creado_en", { ascending: false })
    .limit(100);

  const avisos: AvisoVista[] = (filas ?? []).map((f) => ({
    id: f.id,
    titulo: f.titulo,
    cuerpo: f.cuerpo,
    url: f.url,
    fecha: formatearFechaMadrid(f.creado_en, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    sinLeer: f.leido_en == null,
  }));

  const hayAlgoSinLeer = avisos.some((a) => a.sinLeer);
  const hayLeidos = avisos.some((a) => !a.sinLeer);

  // La action de un `<form>` tiene que devolver `void`/`Promise<void>`, igual
  // que en `FilaAviso`.
  async function marcarTodosLeidosAction() {
    "use server";
    await marcarTodosLeidos();
  }

  async function borrarLeidosAction() {
    "use server";
    await borrarLeidos();
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      {/* `medida="panel"` en la Cabecera Y en el Contenedor de abajo: si no
          coinciden, el título queda desalineado respecto a la caja de filas. */}
      <Cabecera titulo="Avisos" volverA="/club" medida="panel" />
      <Contenedor medida="panel">
        {avisos.length === 0 ? (
          <EstadoVacio
            icono="🔔"
            titulo="Sin avisos todavía"
            detalle="Aquí irá apareciendo lo que te vaya avisando el club"
          />
        ) : (
          <>
            {/* Cada botón solo si tiene trabajo: uno que no hace nada es peor
                que no tenerlo. Borrar solo toca LEÍDOS (policy de la 0034): lo
                que no se ha visto no desaparece, primero se marca leído. */}
            {(hayAlgoSinLeer || hayLeidos) && (
              <div className="mb-3 flex flex-wrap justify-end gap-2">
                {hayLeidos && (
                  <form action={borrarLeidosAction}>
                    <BotonAccion
                      variante="secundario"
                      trabajando="Borrando…"
                      className="px-3 py-1.5 text-sm font-medium"
                    >
                      Borrar los leídos
                    </BotonAccion>
                  </form>
                )}
                {hayAlgoSinLeer && (
                  <form action={marcarTodosLeidosAction}>
                    <BotonAccion
                      variante="secundario"
                      trabajando="Marcando…"
                      className="px-3 py-1.5 text-sm font-medium"
                    >
                      Marcar todos como leídos
                    </BotonAccion>
                  </form>
                )}
              </div>
            )}
            <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
              <ul className="divide-y divide-borde">
                {avisos.map((a) => (
                  <li key={a.id}>
                    <FilaAviso aviso={a} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Contenedor>
    </main>
  );
}
