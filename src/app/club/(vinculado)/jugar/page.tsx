import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Contenedor } from "@/components/ui/Contenedor";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Retos } from "./Retos";

/**
 * Jugar: lo que tienes en marcha, los retos y a quién retar.
 *
 * TODO EN UNA PANTALLA a propósito. Son tres listas cortas —una partida abierta, un
 * par de retos y la lista de socios— y repartirlas en pestañas obligaría a buscar
 * en cuál está lo que quieres.
 */
export default async function JugarPage() {
  const sesion = await sesionActual();
  const supabase = await createServerSupabase();
  const yo = sesion?.playerId ?? null;

  const [{ data: partidas }, { data: retos }, { data: socios }, { data: conCuenta }] =
    await Promise.all([
    supabase
      .from("live_games")
      .select("id, blancas_id, negras_id, resultado, creada_en, base_ms, incremento_ms")
      .order("creada_en", { ascending: false })
      .limit(20),
    yo
      ? supabase
          .from("challenges")
          .select("id, reta_id, retado_id, base_min, incremento_s, color, estado, live_game_id")
          .eq("estado", "pendiente")
          .order("creado_en", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("players").select("id, nombre").eq("activo", true).order("nombre"),
    // SOLO SE PUEDE RETAR A QUIEN TIENE CUENTA. Las 46 fichas del orden de fuerza
    // son socios del club, pero la mayoría todavía no se ha registrado: retar a una
    // de ellas creaba un reto que no podía aceptar nadie y se quedaba ahí colgado.
    supabase.from("profiles").select("player_id").not("player_id", "is", null),
  ]);

  const nombre = new Map((socios ?? []).map((s) => [s.id, s.nombre as string]));
  const registrados = new Set((conCuenta ?? []).map((p) => p.player_id as string));
  const enJuego = (partidas ?? []).filter((p) => p.resultado === null);
  const mias = enJuego.filter((p) => p.blancas_id === yo || p.negras_id === yo);
  const otras = enJuego.filter((p) => p.blancas_id !== yo && p.negras_id !== yo);
  const acabadas = (partidas ?? []).filter((p) => p.resultado !== null).slice(0, 6);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Jugar"
        subtitulo="Partidas en vivo contra otros socios"
        volverA="/club"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {!yo && (
          <EstadoVacio
            icono="♟"
            titulo="Necesitas ficha del club"
            detalle="En cuanto te aprueben la ficha podrás retar a otros socios."
          />
        )}

        {yo && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Seccion titulo="Tus partidas">
                {mias.length === 0 ? (
                  <Tarjeta compacta>
                    <p className="text-sm text-tinta-suave">No tienes ninguna en marcha.</p>
                  </Tarjeta>
                ) : (
                  <Caja>
                    {mias.map((p) => (
                      <Fila
                        key={p.id}
                        id={p.id}
                        texto={`${nombre.get(p.blancas_id) ?? "—"} — ${nombre.get(p.negras_id) ?? "—"}`}
                        cadencia={`${Math.round(p.base_ms / 60_000)}+${Math.round(p.incremento_ms / 1000)}`}
                        etiqueta="Seguir"
                      />
                    ))}
                  </Caja>
                )}
              </Seccion>

              <Retos
                yo={yo}
                retos={(retos ?? []).map((r) => ({
                  id: r.id,
                  retaId: r.reta_id,
                  retadoId: r.retado_id,
                  retaNombre: nombre.get(r.reta_id) ?? "Socio",
                  retadoNombre: nombre.get(r.retado_id) ?? "Socio",
                  baseMin: r.base_min,
                  incrementoS: r.incremento_s,
                  color: r.color,
                }))}
                socios={(socios ?? [])
                  .filter((s) => s.id !== yo && registrados.has(s.id))
                  .map((s) => ({ id: s.id, nombre: s.nombre }))}
              />
            </div>

            <div className="space-y-4">
              <Seccion titulo="Se están jugando">
                {otras.length === 0 ? (
                  <Tarjeta compacta>
                    <p className="text-sm text-tinta-suave">Ahora mismo no juega nadie más.</p>
                  </Tarjeta>
                ) : (
                  <Caja>
                    {otras.map((p) => (
                      <Fila
                        key={p.id}
                        id={p.id}
                        texto={`${nombre.get(p.blancas_id) ?? "—"} — ${nombre.get(p.negras_id) ?? "—"}`}
                        cadencia={`${Math.round(p.base_ms / 60_000)}+${Math.round(p.incremento_ms / 1000)}`}
                        etiqueta="Ver"
                      />
                    ))}
                  </Caja>
                )}
              </Seccion>

              {acabadas.length > 0 && (
                <Seccion titulo="Últimas jugadas">
                  <Caja>
                    {acabadas.map((p) => (
                      <Fila
                        key={p.id}
                        id={p.id}
                        texto={`${nombre.get(p.blancas_id) ?? "—"} — ${nombre.get(p.negras_id) ?? "—"}`}
                        cadencia={p.resultado ?? ""}
                        etiqueta="Ver"
                      />
                    ))}
                  </Caja>
                </Seccion>
              )}
            </div>
          </div>
        )}
      </Contenedor>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
      <ul className="divide-y divide-borde">{children}</ul>
    </div>
  );
}

function Fila({
  id,
  texto,
  cadencia,
  etiqueta,
}: {
  id: string;
  texto: string;
  cadencia: string;
  etiqueta: string;
}) {
  return (
    <li>
      <Link
        href={`/club/jugar/${id}`}
        className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-tarjeta-suave"
      >
        <span className="min-w-0 flex-1 truncate text-sm text-tinta">{texto}</span>
        <span className="shrink-0 text-xs tabular-nums text-tinta-suave">{cadencia}</span>
        <span className="shrink-0 text-xs font-semibold text-acento-texto">{etiqueta}</span>
      </Link>
    </li>
  );
}
