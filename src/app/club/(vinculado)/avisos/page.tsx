import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Contenedor } from "@/components/ui/Contenedor";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { marcarLeido } from "./actions";

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
 * TODA LA FILA ES UN `<form>` CON UN `<button>` A PANTALLA COMPLETA, no un
 * componente cliente con `onClick`: `marcarLeido` ya sabe navegar sola (mira
 * `actions.ts`) cuando el aviso trae `url`, así que no hace falta JavaScript
 * en el navegador para nada de esto — ni para marcar leído ni para el salto.
 * Si el aviso NO trae `url` (hoy ninguno de los 11 tipos se manda sin ella,
 * pero la columna es nullable y nada obliga a que seguirá siendo así), el
 * botón igualmente marca leído y se queda en la propia bandeja.
 */
function FilaAviso({ aviso }: { aviso: AvisoVista }) {
  // La action de un `<form>` tiene que devolver `void`/`Promise<void>`, y
  // `marcarLeido` devuelve `{ error? }` para quien quiera comprobarlo por
  // código (no hace falta aquí: sin filtros ni deshacer, no hay nada que
  // enseñar si falla salvo dejar el aviso como estaba). De ahí este envoltorio
  // en vez de pasar `marcarLeido.bind(null, aviso.id)` directamente.
  async function marcarEsteLeido() {
    "use server";
    await marcarLeido(aviso.id);
  }
  return (
    <form action={marcarEsteLeido}>
      <button
        type="submit"
        className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition hover:bg-tarjeta-suave sm:flex-row sm:items-start sm:gap-3 ${
          aviso.sinLeer ? "bg-tarjeta-suave" : ""
        }`}
      >
        {/* El puntito solo existe para el no leído: es el destaque, no un
            adorno fijo. `aria-hidden` porque lo mismo ya lo dice el peso de
            la fuente del título para quien usa lector de pantalla. */}
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
          <span className="block text-sm text-tinta-suave">{aviso.cuerpo}</span>
        </span>
        <span className="shrink-0 pl-4 text-xs text-tinta-suave sm:pl-0 sm:pt-0.5">
          {aviso.fecha}
        </span>
      </button>
    </form>
  );
}

/**
 * Bandeja de avisos del socio.
 *
 * SIN FILTROS, SIN BUSCADOR, SIN "MARCAR TODOS COMO LEÍDOS" — decisión de la
 * spec (YAGNI): con un puñado de avisos por semana, una lista sola ya es
 * suficiente y cualquiera de esos tres controles es una pantalla que mantener
 * para un problema que todavía no existe.
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
          <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
            <ul className="divide-y divide-borde">
              {avisos.map((a) => (
                <li key={a.id}>
                  <FilaAviso aviso={a} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Contenedor>
    </main>
  );
}
